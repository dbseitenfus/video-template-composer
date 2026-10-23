<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { buildTimeline, gainAt, locate, musicGainKeyframes, renderFrame, type SizedImage } from '@takeslot/engine'
import type { TemplateEntry } from '@takeslot/templates'
import { templateAssets } from '@takeslot/schema'
import { readFile } from '../lib/opfs'
import { formatDuration } from '../lib/format'

/*
 * Preview: o componente só controla o relógio e o canvas; quem desenha é a mesma
 * `renderFrame` usada pelo Worker de exportação.
 */

const props = defineProps<{
  entry: TemplateEntry
  /** Caminho no OPFS do take de cada slot. */
  takePaths: Record<string, string>
  takeDurations: Record<string, number>
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const playing = ref(false)
const time = ref(0)
const loading = ref(true)

const template = computed(() => props.entry.template)
const timeline = computed(() => buildTimeline(template.value, props.takeDurations))
const musicCurve = computed(() => musicGainKeyframes(template.value, timeline.value))

// Objetos de mídia ficam fora da reatividade.
const videos = shallowRef<Record<string, HTMLVideoElement>>({})
const images: Record<string, SizedImage> = {}
const objectUrls: string[] = []
let audioCtx: AudioContext | null = null
let musicBuffer: AudioBuffer | null = null
let musicNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null
let raf = 0
let clockStart = 0
let clockOffset = 0
let activeSlot: string | null = null

/** Resolução do canvas do preview: proporção do template, lado maior ~720 px. */
const size = computed(() => {
  const { width, height } = template.value.canvas
  const scale = 720 / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
})

async function load() {
  loading.value = true
  const vids: Record<string, HTMLVideoElement> = {}
  await Promise.all(
    Object.entries(props.takePaths).map(async ([slotId, path]) => {
      const file = await readFile(path)
      if (!file) return
      const url = URL.createObjectURL(file)
      objectUrls.push(url)
      const v = document.createElement('video')
      v.src = url
      v.playsInline = true
      v.preload = 'auto'
      v.muted = false
      await new Promise<void>((resolve) => {
        v.addEventListener('loadeddata', () => resolve(), { once: true })
        v.addEventListener('error', () => resolve(), { once: true })
        v.load()
      })
      vids[slotId] = markRaw(v)
    }),
  )
  videos.value = vids

  const { images: imageNames } = templateAssets(template.value)
  await Promise.all(
    imageNames.map(async (name) => {
      const img = new Image()
      img.src = props.entry.assets[name]!
      await img.decode().catch(() => {})
      images[name] = { image: img, width: img.naturalWidth, height: img.naturalHeight }
    }),
  )
  loading.value = false
  draw()
}

function now() {
  return playing.value ? clockOffset + (performance.now() - clockStart) / 1000 : time.value
}

function draw() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  const t = time.value
  const located = locate(timeline.value, t)
  let frame = null
  if (located?.segment.kind === 'slot') {
    const v = videos.value[located.segment.slot.id]
    if (v && v.readyState >= 2) frame = { image: v, width: v.videoWidth, height: v.videoHeight }
  }
  renderFrame(ctx, template.value, t, { timeline: timeline.value, frame, images })
}

/** Mantém o vídeo do slot ativo tocando no tempo certo; o relógio do preview é o mestre. */
function syncVideos(t: number, seek: boolean) {
  const located = locate(timeline.value, t)
  const slotId = located?.segment.kind === 'slot' ? located.segment.slot.id : null
  if (slotId !== activeSlot) {
    if (activeSlot) videos.value[activeSlot]?.pause()
    activeSlot = slotId
    seek = true
  }
  if (!slotId || !located) return
  const v = videos.value[slotId]
  if (!v) return
  if (seek || Math.abs(v.currentTime - located.local) > 0.25) v.currentTime = located.local
  if (playing.value && v.paused) void v.play().catch(() => {})
  if (!playing.value && !v.paused) v.pause()
}

async function startMusic(t: number) {
  const music = template.value.music
  if (!music) return
  audioCtx ??= new AudioContext()
  await audioCtx.resume()
  if (!musicBuffer) {
    const data = await (await fetch(props.entry.assets[music.asset]!)).arrayBuffer()
    musicBuffer = await audioCtx.decodeAudioData(data)
  }
  stopMusic()
  const src = audioCtx.createBufferSource()
  src.buffer = musicBuffer
  src.loop = music.loop
  const gain = audioCtx.createGain()
  const base = audioCtx.currentTime
  gain.gain.setValueAtTime(gainAt(musicCurve.value, t), base)
  for (const k of musicCurve.value) if (k.time > t) gain.gain.linearRampToValueAtTime(k.gain, base + k.time - t)
  src.connect(gain).connect(audioCtx.destination)
  src.start(base, music.loop ? t % musicBuffer.duration : t)
  musicNodes = { src, gain }
}

function stopMusic() {
  if (!musicNodes) return
  musicNodes.src.stop()
  musicNodes.src.disconnect()
  musicNodes.gain.disconnect()
  musicNodes = null
}

function tick() {
  if (!playing.value) return
  const t = now()
  if (t >= timeline.value.duration) {
    pause()
    seek(0)
    return
  }
  time.value = t
  syncVideos(t, false)
  draw()
  raf = requestAnimationFrame(tick)
}

async function play() {
  if (loading.value || playing.value) return
  if (time.value >= timeline.value.duration - 0.05) time.value = 0
  playing.value = true
  clockOffset = time.value
  clockStart = performance.now()
  syncVideos(time.value, true)
  void startMusic(time.value)
  raf = requestAnimationFrame(tick)
}

function pause() {
  playing.value = false
  cancelAnimationFrame(raf)
  stopMusic()
  for (const v of Object.values(videos.value)) v.pause()
}

function seek(t: number) {
  const wasPlaying = playing.value
  if (wasPlaying) pause()
  time.value = Math.max(0, Math.min(t, timeline.value.duration))
  syncVideos(time.value, true)
  const located = locate(timeline.value, time.value)
  const v = located?.segment.kind === 'slot' ? videos.value[located.segment.slot.id] : undefined
  if (v) v.addEventListener('seeked', draw, { once: true })
  draw()
  if (wasPlaying) void play()
}

watch(() => [props.takePaths, props.entry], () => {
  pause()
  cleanup()
  void load()
})

function cleanup() {
  for (const v of Object.values(videos.value)) {
    v.pause()
    v.removeAttribute('src')
    v.load()
  }
  videos.value = {}
  objectUrls.splice(0).forEach((u) => URL.revokeObjectURL(u))
  activeSlot = null
}

onMounted(load)
onBeforeUnmount(() => {
  pause()
  cleanup()
  void audioCtx?.close()
})

defineExpose({ pause })
</script>

<template>
  <div class="preview">
    <div class="stage" :style="{ aspectRatio: `${size.width} / ${size.height}`, width: `min(100%, calc(65vh * ${size.width / size.height}))` }">
      <canvas ref="canvas" :width="size.width" :height="size.height" @click="playing ? pause() : play()" />
      <div v-if="loading" class="overlay">Carregando takes…</div>
      <button v-else-if="!playing" class="overlay play" aria-label="Reproduzir" @click="play">▶</button>
    </div>
    <div class="controls">
      <button class="ghost small" :disabled="loading" @click="playing ? pause() : play()">{{ playing ? 'Pausar' : 'Reproduzir' }}</button>
      <input
        type="range"
        min="0"
        :max="timeline.duration"
        step="0.01"
        :value="time"
        aria-label="Posição"
        @input="seek(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="time">{{ formatDuration(time) }} / {{ formatDuration(timeline.duration) }}</span>
    </div>
  </div>
</template>

<style scoped>
.preview {
  display: grid;
  gap: 0.75rem;
}
.stage {
  position: relative;
  margin: 0 auto;
  background: #000;
  border-radius: 14px;
  overflow: hidden;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgb(0 0 0 / 0.25);
  border: 0;
  font-size: 1rem;
}
.overlay.play {
  font-size: 3rem;
  cursor: pointer;
}
.controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.controls input {
  flex: 1;
  min-width: 0;
}
.time {
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  color: var(--muted);
  white-space: nowrap;
}
</style>
