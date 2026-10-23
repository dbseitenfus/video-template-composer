<script setup lang="ts">
defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="backdrop" role="dialog" aria-modal="true" :aria-label="title" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="sheet">
      <header class="row">
        <strong>{{ title }}</strong>
        <button class="ghost small" @click="emit('close')">Fechar</button>
      </header>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgb(0 0 0 / 0.65);
  display: grid;
  place-items: center;
  padding: 1rem;
}
.sheet {
  width: min(860px, 100%);
  max-height: 90dvh;
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1rem;
  display: grid;
  gap: 1rem;
}
header {
  justify-content: space-between;
}
</style>
