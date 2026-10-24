<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

/**
 * Mostra um trecho de vídeo pronto do modelo (de `start` a `start + duration`).
 * Durante a gravação a pessoa não vê esses vídeos, então eles aparecem:
 * - `before`: antes de gravar um trecho que vem logo depois do vídeo (ex.: um comentário);
 * - `after`: antes de gravar um trecho que apresenta o vídeo que vem em seguida;
 * - `view`: na lista de trechos, só para assistir.
 */
const props = withDefaults(defineProps<{ src: string; start: number; duration: number; title: string; mode?: 'before' | 'after' | 'view' }>(), {
  mode: 'before',
})
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
      <template v-if="mode === 'before'">
        <p class="eyebrow">Antes de gravar</p>
        <h2>Veja o trecho do vídeo que vem antes do seu comentário</h2>
        <p class="muted">No vídeo final, seu trecho entra logo depois desta parte de “{{ title }}”.</p>
      </template>
      <template v-else-if="mode === 'after'">
        <p class="eyebrow">Antes de gravar</p>
        <h2>Veja o vídeo que vem depois do seu trecho</h2>
        <p class="muted">No vídeo final, “{{ title }}” entra logo depois do que você gravar.</p>
      </template>
      <template v-else>
        <p class="eyebrow">Vídeo do modelo</p>
        <h2>{{ title }}</h2>
        <p class="muted">Este vídeo já faz parte do modelo: você não precisa gravá-lo.</p>
      </template>
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
        <button data-testid="clip-part-done" @click="emit('close')">
          {{ mode === 'view' ? 'Fechar' : ended ? 'Gravar meu trecho' : 'Pular e gravar' }}
        </button>
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
