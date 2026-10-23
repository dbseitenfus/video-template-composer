<script setup lang="ts">
import { computed } from 'vue'
import type { ExportProgress } from '@takeslot/engine'
import type { ExportStatus } from '../stores/export'
import { formatDuration } from '../lib/format'

const props = defineProps<{ status: ExportStatus; progress: ExportProgress | null }>()

const label = computed(() => {
  if (props.status === 'preparing') return 'Preparando áudio e imagens…'
  if (props.status === 'benchmarking') return 'Medindo a velocidade do aparelho…'
  const p = props.progress
  if (!p) return 'Iniciando…'
  if (p.phase === 'video') return `Montando o vídeo · parte ${Math.min(p.chunksDone + 1, p.totalChunks)} de ${p.totalChunks}`
  if (p.phase === 'audio') return 'Codificando o áudio…'
  if (p.phase === 'mux') return 'Juntando as partes…'
  return 'Pronto'
})

const percent = computed(() => Math.round((props.progress?.fraction ?? 0) * 100))
</script>

<template>
  <div class="progress" role="status" aria-live="polite">
    <div class="row">
      <span>{{ label }}</span>
      <strong>{{ percent }}%</strong>
    </div>
    <div class="bar" :class="{ indeterminate: status === 'preparing' || status === 'benchmarking' }">
      <div class="fill" :style="{ width: `${percent}%` }" />
    </div>
    <div v-if="progress && progress.phase === 'video' && progress.speed > 0" class="row meta">
      <span>{{ progress.speed.toFixed(1) }}× tempo real</span>
      <span v-if="progress.etaSeconds !== null">faltam ~{{ formatDuration(progress.etaSeconds) }}</span>
    </div>
  </div>
</template>

<style scoped>
.progress {
  display: grid;
  gap: 0.4rem;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.meta {
  font-size: 0.85rem;
  color: var(--muted);
}
.bar {
  height: 10px;
  background: var(--surface-2);
  border-radius: 99px;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.indeterminate .fill {
  width: 30% !important;
  animation: slide 1.2s ease-in-out infinite;
}
@keyframes slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(340%);
  }
}
</style>
