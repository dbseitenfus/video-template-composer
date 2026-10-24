<script setup lang="ts">
import { site } from '../site'

/** Marca do app: ícone + nome. */
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <span class="brand-mark" :style="{ fontSize: `${size * 0.72}px` }">
    <svg :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M12.5 9.5 L23 16 L12.5 22.5 Z" fill="#fff" />
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
