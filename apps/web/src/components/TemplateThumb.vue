<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ALL_FORMATS, Input, UrlSource, VideoSampleSink } from 'mediabunny'
import { buildTimeline, renderFrame, type ClipSegment, type FrameSource, type SizedImage, type Timeline } from '@takeslot/engine'
import { templateAssets } from '@takeslot/schema'
import type { TemplateEntry } from '@takeslot/templates'
import { personPlaceholder } from '../lib/placeholder'
import { enqueue, withTimeout } from '../lib/serial'

/**
 * Miniatura real do modelo, desenhada pela mesma renderFrame do vídeo:
 * um quadro do primeiro vídeo pronto da sequência, com textos e logo por cima.
 * Sem vídeo pronto, mostra o primeiro trecho gravado com uma silhueta no lugar da pessoa.
 * Se o template tiver uma capa (`thumbnail`), mostra a imagem da capa.
 */
const props = withDefaults(defineProps<{ entry: TemplateEntry; height?: number }>(), { height: 180 })
const canvas = ref<HTMLCanvasElement | null>(null)
/** Capa definida no admin (imagem pronta); quando existe, substitui o quadro desenhado. */
const cover = props.entry.template.thumbnail ? props.entry.assets[props.entry.template.thumbnail] : undefined
const { width: cw, height: ch } = props.entry.template.canvas
const width = Math.round((props.height * cw) / ch)
const scale = 2
let observer: IntersectionObserver | null = null

async function loadImages(): Promise<Record<string, SizedImage>> {
  const { template, assets } = props.entry
  const images: Record<string, SizedImage> = {}
  await Promise.all(
    templateAssets(template).images.map(async (name) => {
      const img = new Image()
      img.src = assets[name]!
      await img.decode().catch(() => {})
      images[name] = { image: img, width: img.naturalWidth, height: img.naturalHeight }
    }),
  )
  return images
}

/** Instante dentro do clipe: ~2 s, quando as animações de entrada já terminaram. */
const clipMoment = (segment: ClipSegment) => Math.min(2, segment.duration / 2)

/** Desenha o quadro do clipe. Lê só o necessário do arquivo (o início e o keyframe mais próximo). */
async function drawClipFrame(ctx: CanvasRenderingContext2D, timeline: Timeline, segment: ClipSegment, images: Record<string, SizedImage>) {
  const url = new URL(props.entry.assets[segment.clip.asset]!, location.href)
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track || !(await track.canDecode())) return false
    const local = clipMoment(segment)
    const sample = await new VideoSampleSink(track).getSample((await track.getFirstTimestamp()) + segment.clip.trimStart + local)
    if (!sample) return false
    const frame: FrameSource = {
      image: sample.toCanvasImageSource(),
      width: sample.squarePixelWidth,
      height: sample.squarePixelHeight,
      rotation: track.rotation,
    }
    renderFrame(ctx, props.entry.template, segment.start + local, { timeline, frame, images })
    sample.close()
    return true
  } catch {
    return false
  } finally {
    input.dispose()
  }
}

async function render() {
  const el = canvas.value
  if (!el) return
  const { template } = props.entry
  const durations = Object.fromEntries(template.slots.map((s) => [s.id, Math.min(s.maxDuration, Math.max(s.minDuration, 6))]))
  const timeline = buildTimeline(template, durations)
  el.width = width * scale
  el.height = props.height * scale
  const ctx = el.getContext('2d')!
  const images = await loadImages()

  const clip = timeline.segments.find((s): s is ClipSegment => s.kind === 'clip')
  if (clip && (await enqueue(() => withTimeout(drawClipFrame(ctx, timeline, clip, images), 10_000, false)))) return

  // Sem vídeo pronto (ou se ele não carregar): uma pessoa gravando, com a legenda do trecho.
  const slot = timeline.segments.find((s) => s.kind === 'slot') ?? timeline.segments[0]
  if (!slot) return
  const frame = slot.kind === 'slot' ? personPlaceholder(el.width, el.height) : null
  renderFrame(ctx, template, slot.start + Math.min(2, slot.duration / 2), { timeline, frame, images })
}

onMounted(() => {
  if (cover) return
  // Só carrega quando o card aparece: no celular, evita baixar vídeos de modelos que ninguém viu.
  if (!('IntersectionObserver' in window) || !canvas.value) return void render()
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer?.disconnect()
        observer = null
        void render()
      }
    },
    { rootMargin: '200px' },
  )
  observer.observe(canvas.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <img v-if="cover" :src="cover" class="thumb cover" :style="{ width: `${width}px`, height: `${height}px` }" alt="" loading="lazy" />
  <canvas v-else ref="canvas" class="thumb" :style="{ width: `${width}px`, height: `${height}px` }" aria-hidden="true" />
</template>

<style scoped>
.thumb {
  display: block;
  object-fit: cover;
  border-radius: 12px;
  background: #000;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
</style>
