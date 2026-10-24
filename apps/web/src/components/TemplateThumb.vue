<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { buildTimeline, renderFrame, type FrameSource, type SizedImage } from '@takeslot/engine'
import { templateAssets } from '@takeslot/schema'
import type { TemplateEntry } from '@takeslot/templates'
import { personPlaceholder } from '../lib/placeholder'

/** Miniatura real do modelo: o primeiro trecho com voz, desenhado pela mesma renderFrame do vídeo. */
const props = withDefaults(defineProps<{ entry: TemplateEntry; height?: number }>(), { height: 180 })
const canvas = ref<HTMLCanvasElement | null>(null)
const { width: cw, height: ch } = props.entry.template.canvas
const width = Math.round((props.height * cw) / ch)

onMounted(async () => {
  const { template, assets } = props.entry
  const durations = Object.fromEntries(template.slots.map((s) => [s.id, Math.min(s.maxDuration, Math.max(s.minDuration, 6))]))
  const timeline = buildTimeline(template, durations)
  const images: Record<string, SizedImage> = {}
  await Promise.all(
    templateAssets(template).images.map(async (name) => {
      const img = new Image()
      img.src = assets[name]!
      await img.decode().catch(() => {})
      images[name] = { image: img, width: img.naturalWidth, height: img.naturalHeight }
    }),
  )
  // Mostra uma pessoa gravando, com a legenda do trecho já na tela.
  const slot = timeline.segments.find((s) => s.kind === 'slot') ?? timeline.segments[0]
  if (!slot || !canvas.value) return
  const scale = 2
  canvas.value.width = width * scale
  canvas.value.height = props.height * scale
  const frame: FrameSource | null = slot.kind === 'slot' ? personPlaceholder(canvas.value.width, canvas.value.height) : null
  renderFrame(canvas.value.getContext('2d')!, template, slot.start + Math.min(2, slot.duration / 2), { timeline, frame, images })
})
</script>

<template>
  <canvas ref="canvas" class="thumb" :style="{ width: `${width}px`, height: `${height}px` }" aria-hidden="true" />
</template>

<style scoped>
.thumb {
  display: block;
  border-radius: 12px;
  background: #000;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
</style>
