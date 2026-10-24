<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

/**
 * Mostra um trecho do vídeo pronto (de `start` a `start + duration`) antes de a pessoa
 * gravar o comentário que vem depois dele: durante a gravação ela não vê o vídeo.
 */
const props = defineProps<{ src: string; start: number; duration: number; title: string }>()
const emit = defineEmits<{ close: [] }>()

const video = ref<HTMLVideoElement | null>(null)
const ended = ref(false)
const end = props.start + props.duration

function onLoaded() {
  if (video.value) video.value.currentTime = props.start
}

function onTime() {
  const v = video.value
  if (v && v.currentTime >= end - 0.05) {
    v.pause()
    ended.value = true
  }
}

function replay() {
  const v = video.value
  if (!v) return
  ended.value = false
  v.currentTime = props.start
  void v.play().catch(() => {})
}

onBeforeUnmount(() => video.value?.pause())
</script>

<template>
  <div class="backdrop" role="dialog" aria-modal="true" aria-label="Trecho do vídeo antes do seu comentário">
    <div class="sheet">
      <p class="eyebrow">Antes de gravar</p>
      <h2>Veja o trecho do vídeo que vem antes do seu comentário</h2>
      <p class="muted">No vídeo final, seu comentário entra logo depois desta parte de “{{ title }}”.</p>
      <video
        ref="video"
        :src="src"
        playsinline
        controls
        preload="auto"
        data-testid="clip-part-video"
        @loadedmetadata="onLoaded"
        @timeupdate="onTime"
      />
      <div class="row actions">
        <button v-if="ended" class="ghost" @click="replay">Ver de novo</button>
        <button data-testid="clip-part-done" @click="emit('close')">{{ ended ? 'Gravar meu comentário' : 'Pular e gravar' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgb(0 0 0 / 0.96);
  display: grid;
  place-items: center;
  padding: 1rem;
}
.sheet {
  width: min(460px, 100%);
  max-height: 100%;
  overflow: auto;
  display: grid;
  gap: 0.6rem;
  color: #fff;
  text-align: center;
}
.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--warn);
}
h2 {
  margin: 0;
  font-size: 1.15rem;
}
.muted {
  margin: 0;
  font-size: 0.85rem;
}
video {
  width: 100%;
  max-height: 55vh;
  background: #000;
  border-radius: 12px;
}
.actions {
  justify-content: center;
}
</style>
