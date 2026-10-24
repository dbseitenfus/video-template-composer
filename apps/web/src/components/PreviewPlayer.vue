<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  buildTimeline,
  clipKey,
  decodeAudioUrl,
  decodeTakeAudio,
  locate,
  mixAudio,
  renderFrame,
  videoKey,
  type FrameSource,
  type Located,
  type SizedImage,
  type VideoSegment,
} from '@takeslot/engine'
import type { TemplateEntry } from '@takeslot/templates'
import { templateAssets } from '@takeslot/schema'
import { readFile } from '../lib/opfs'
import { formatDuration } from '../lib/format'

/*
 * Preview: o componente só controla o relógio e o canvas; quem desenha é a mesma
 * `renderFrame` usada pelo Worker de exportação.
 *
 * O som é a mesma mixagem da exportação (falas normalizadas, clipes e trilha com ducking),
 * tocada pela Web Audio, e é ela que dita o relógio. Os <video> ficam sempre mudos: no iOS,
 * vídeo com som só pode dar play dentro de um toque, e os trechos seguintes ficariam parados.
 */

const props = defineProps<{
  entry: TemplateEntry
  /** Caminho no OPFS do take de cada slot. */
  takePaths?: Record<string, string>
  takeDurations: Record<string, number>
  /** Desenha um marcador no lugar dos trechos sem take (preview do admin). */
  placeholders?: boolean
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const sources = ref<HTMLDivElement | null>(null)
const playing = ref(false)
const time = ref(0)
const loading = ref(true)
const loadingLabel = ref('Carregando vídeos…')

const template = computed(() => props.entry.template)
const timeline = computed(() => buildTimeline(template.value, props.takeDurations))

// Objetos de mídia ficam fora da reatividade.
/** Um elemento de vídeo por take (id do slot) e por clipe fixo (`clip:<id>`). */
const videos = shallowRef<Record<string, HTMLVideoElement>>({})
const images: Record<string, SizedImage> = {}
const objectUrls: string[] = []
let audioCtx: AudioContext | null = null
/** Mixagem completa do vídeo, igual à da exportação. */
let mix: AudioBuffer | null = null
let mixSource: AudioBufferSourceNode | null = null
let raf = 0
/** Relógio: instante do vídeo em `clockOffset` quando o relógio de referência marcava `clockStart`. */
let clockStart = 0
let clockOffset = 0
let activeKey: string | null = null
let lastSeekAt = 0
let loadToken = 0

/** Arquivos de clipes já baixados, compartilhados entre previews (o admin recria o preview a cada edição). */
const clipBlobs = new Map<string, Promise<Blob>>()
const fetchBlob = (url: string) => {
  if (!clipBlobs.has(url)) clipBlobs.set(url, fetch(url).then((r) => r.blob()))
  return clipBlobs.get(url)!
}

/** Resolução do canvas do preview: proporção do template, lado maior ~720 px. */
const size = computed(() => {
  const { width, height } = template.value.canvas
  const scale = 720 / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
})

async function createVideo(blob: Blob): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(blob)
  objectUrls.push(url)
  const v = document.createElement('video')
  v.muted = true
  v.defaultMuted = true
  v.playsInline = true
  v.setAttribute('playsinline', '')
  v.preload = 'auto'
  v.src = url
  // No DOM (invisível): o Safari do iOS só decodifica quadros de vídeos anexados à página.
  sources.value?.append(v)
  await new Promise<void>((resolve) => {
    v.addEventListener('loadeddata', () => resolve(), { once: true })
    v.addEventListener('error', () => resolve(), { once: true })
    v.load()
  })
  return markRaw(v)
}

async function load() {
  const token = ++loadToken
  loading.value = true
  loadingLabel.value = 'Carregando vídeos…'
  const vids: Record<string, HTMLVideoElement> = {}
  const blobs: Record<string, Blob> = {}
  await Promise.all([
    ...Object.entries(props.takePaths ?? {}).map(async ([slotId, path]) => {
      const file = await readFile(path)
      if (!file) return
      blobs[slotId] = file
      vids[slotId] = await createVideo(file)
    }),
    ...template.value.clips.map(async (clip) => {
      // Baixado inteiro e tocado como arquivo local: não depende de Range no servidor.
      const blob = await fetchBlob(props.entry.assets[clip.asset]!)
      blobs[clipKey(clip.id)] = blob
      vids[clipKey(clip.id)] = await createVideo(blob)
    }),
  ])
  if (token !== loadToken) return
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

  loadingLabel.value = 'Preparando o áudio…'
  try {
    const takes: Record<string, AudioBuffer | null> = {}
    const clips: Record<string, AudioBuffer | null> = {}
    for (const slot of template.value.slots) if (blobs[slot.id]) takes[slot.id] = await decodeTakeAudio(blobs[slot.id]!)
    for (const clip of template.value.clips) {
      const blob = blobs[clipKey(clip.id)]
      if (blob && clip.volume > 0) clips[clip.id] = await decodeTakeAudio(blob)
    }
    const musicUrl = template.value.music ? props.entry.assets[template.value.music.asset] : undefined
    const music = musicUrl ? await decodeAudioUrl(musicUrl) : null
    const mixed = await mixAudio({ template: template.value, timeline: timeline.value, takes, clips, music })
    if (token !== loadToken) return
    mix = new AudioBuffer({ length: mixed.channels[0]!.length, numberOfChannels: mixed.channels.length, sampleRate: mixed.sampleRate })
    mixed.channels.forEach((data, c) => mix!.copyToChannel(data as Float32Array<ArrayBuffer>, c))
  } catch {
    // Sem áudio o preview continua funcionando, em silêncio, com relógio próprio.
    mix = null
  }
  loading.value = false
  draw()
}

const placeholderCache = new Map<string, FrameSource>()

/** Quadro listrado com o nome do trecho: indica onde entra a gravação do usuário. */
function placeholder(label: string): FrameSource {
  const { width, height } = size.value
  const key = `${label}|${width}x${height}`
  const cached = placeholderCache.get(key)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#2a2a4d'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = width / 30
  for (let x = -height; x < width; x += width / 10) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + height, height)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.textAlign = 'center'
  ctx.font = `600 ${Math.round(Math.min(width, height) * 0.06)}px system-ui, sans-serif`
  ctx.fillText('Gravação do usuário', width / 2, height / 2)
  ctx.font = `500 ${Math.round(Math.min(width, height) * 0.045)}px system-ui, sans-serif`
  ctx.fillText(label, width / 2, height / 2 + Math.min(width, height) * 0.08)
  const frame = { image: c, width, height }
  placeholderCache.set(key, frame)
  return frame
}

/** Relógio de referência: o do áudio quando há mixagem tocando, senão o do sistema. */
function reference(): number {
  return mixSource && audioCtx ? audioCtx.currentTime : performance.now() / 1000
}

function now() {
  return playing.value ? clockOffset + (reference() - clockStart) : time.value
}

function draw() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  const t = time.value
  const located = locate(timeline.value, t)
  const v = activeVideo(located)?.video
  let frame: FrameSource | null = v && v.readyState >= 2 ? { image: v, width: v.videoWidth, height: v.videoHeight } : null
  if (!frame && props.placeholders && located?.segment.kind === 'slot') frame = placeholder(located.segment.slot.label)
  renderFrame(ctx, template.value, t, { timeline: timeline.value, frame, images })
}

const fileOffset = (segment: VideoSegment) => (segment.kind === 'clip' ? segment.clip.trimStart : 0)

/** Vídeo do segmento ativo (take ou clipe) e o tempo correspondente dentro do arquivo. */
function activeVideo(located: Located | null): { key: string; video: HTMLVideoElement | undefined; time: number; index: number } | null {
  const segment = located?.segment
  if (!located || !segment || (segment.kind !== 'slot' && segment.kind !== 'clip')) return null
  const key = videoKey(segment)
  return { key, video: videos.value[key], time: located.local + fileOffset(segment), index: segment.index }
}

/** Deixa o vídeo do próximo trecho já posicionado no início, para a troca não esperar um seek. */
function prepareNext(afterIndex: number) {
  const next = timeline.value.segments.slice(afterIndex + 1).find((s): s is VideoSegment => s.kind === 'slot' || s.kind === 'clip')
  if (!next) return
  const v = videos.value[videoKey(next)]
  const target = fileOffset(next)
  if (v && v.paused && !v.seeking && Math.abs(v.currentTime - target) > 0.05) v.currentTime = target
}

/**
 * Mantém o vídeo do segmento ativo no tempo do relógio. Seek só na troca de trecho ou
 * se a diferença ficar grande (com intervalo mínimo); diferenças pequenas são corrigidas
 * ajustando a velocidade, o que não trava a imagem.
 */
function syncVideos(t: number, seek: boolean) {
  const active = activeVideo(locate(timeline.value, t))
  const key = active?.key ?? null
  if (key !== activeKey) {
    if (activeKey) videos.value[activeKey]?.pause()
    activeKey = key
    seek = true
    if (active) prepareNext(active.index)
  }
  const v = active?.video
  if (!active || !v) return
  const drift = v.currentTime - active.time
  const nowMs = performance.now()
  if (seek) {
    if (Math.abs(drift) > 0.05) v.currentTime = active.time
    lastSeekAt = nowMs
    v.playbackRate = 1
  } else if (playing.value && !v.seeking) {
    if (Math.abs(drift) > 0.6 && nowMs - lastSeekAt > 1500) {
      v.currentTime = active.time + 0.15 // um pouco à frente: o seek leva tempo
      lastSeekAt = nowMs
    } else {
      v.playbackRate = Math.min(1.15, Math.max(0.85, 1 - drift))
    }
  }
  if (playing.value && v.paused) void v.play().catch(() => {})
  if (!playing.value && !v.paused) v.pause()
}

function startAudio(t: number) {
  stopAudio()
  if (!mix || !audioCtx) return
  const src = audioCtx.createBufferSource()
  src.buffer = mix
  src.connect(audioCtx.destination)
  src.start(0, Math.min(t, mix.duration))
  mixSource = src
}

function stopAudio() {
  if (!mixSource) return
  try {
    mixSource.stop()
  } catch {
    // já parado
  }
  mixSource.disconnect()
  mixSource = null
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
  // AudioContext criado e retomado dentro do toque (exigência do iOS).
  audioCtx ??= new AudioContext()
  void audioCtx.resume()
  playing.value = true
  startAudio(time.value)
  clockOffset = time.value
  clockStart = reference()
  syncVideos(time.value, true)
  raf = requestAnimationFrame(tick)
}

function pause() {
  if (playing.value) time.value = now()
  playing.value = false
  cancelAnimationFrame(raf)
  stopAudio()
  for (const v of Object.values(videos.value)) v.pause()
}

function seek(t: number) {
  const wasPlaying = playing.value
  if (wasPlaying) pause()
  time.value = Math.max(0, Math.min(t, timeline.value.duration))
  syncVideos(time.value, true)
  const v = activeVideo(locate(timeline.value, time.value))?.video
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
    v.remove()
  }
  videos.value = {}
  objectUrls.splice(0).forEach((u) => URL.revokeObjectURL(u))
  activeKey = null
  mix = null
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
      <div ref="sources" class="sources" aria-hidden="true" />
      <div v-if="loading" class="overlay">{{ loadingLabel }}</div>
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
.sources {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
.sources :deep(video) {
  width: 1px;
  height: 1px;
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
