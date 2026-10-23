<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/** Imagem ao vivo da câmera, com a moldura do enquadramento final do template. */
const props = defineProps<{
  stream: MediaStream | null
  mirrored: boolean
  /** Proporção largura/altura do vídeo final. */
  aspect: number
}>()

const video = ref<HTMLVideoElement | null>(null)
const videoSize = ref({ width: 0, height: 0 })

watch(
  [video, () => props.stream],
  ([el, stream]) => {
    if (!el) return
    el.srcObject = stream
    if (stream) void el.play().catch(() => {})
  },
  { immediate: true },
)

function onMetadata() {
  if (video.value) videoSize.value = { width: video.value.videoWidth, height: video.value.videoHeight }
}

/** Caixa do vídeo na tela, na proporção real da captura (a moldura é posicionada dentro dela). */
const frameStyle = computed(() => {
  const { width, height } = videoSize.value
  if (!width || !height) return {}
  return { aspectRatio: `${width} / ${height}`, width: `min(100%, calc(100dvh * ${width / height}))`, height: "auto" }
})

/** Retângulo (em % da captura) da área que entra no vídeo final, com `fit: cover`. */
const guide = computed(() => {
  const { width, height } = videoSize.value
  if (!width || !height) return null
  const source = width / height
  if (Math.abs(source - props.aspect) < 0.02) return null
  return source > props.aspect
    ? { width: (props.aspect / source) * 100, height: 100 }
    : { width: 100, height: (source / props.aspect) * 100 }
})

defineExpose({ video })
</script>

<template>
  <div class="camera">
    <div class="frame" :style="frameStyle">
      <video ref="video" autoplay muted playsinline :class="{ mirrored }" @loadedmetadata="onMetadata" @resize="onMetadata" />
      <div v-if="guide" class="guide" :style="{ width: `${guide.width}%`, height: `${guide.height}%` }" aria-hidden="true" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.camera {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
  display: grid;
  place-items: center;
}
.frame {
  position: relative;
  width: 100%;
  height: 100%;
  max-height: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
}
video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.mirrored {
  transform: scaleX(-1);
}
.guide {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  border: 2px dashed rgb(255 255 255 / 0.55);
  /* Sem border-radius: o spread da sombra arredondaria os cantos e deixaria brechas claras. */
  box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.5);
  pointer-events: none;
}
</style>
