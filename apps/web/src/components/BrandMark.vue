<script setup lang="ts">
import { site } from '../site'

/** Marca do app: ícone no formato do botão do YouTube, em verde e amarelo (bandeira), + nome. */
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <span class="brand-mark" :style="{ fontSize: `${size * 0.72}px` }">
    <svg :width="Math.round((size * 40) / 28)" :height="size" viewBox="0 0 40 28" aria-hidden="true">
      <rect width="40" height="28" rx="8" fill="#009c3b" />
      <path d="M16 8 L28 14 L16 20 Z" fill="#ffdf00" />
    </svg>
    <span>{{ site.brand }}</span>
  </span>
</template>

<style scoped>
.brand-mark {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
}
svg {
  flex: none;
}
</style>
