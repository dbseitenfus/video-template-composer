<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { readFile } from '../lib/opfs'

/** Assistir um take gravado (lido do OPFS sob demanda). */
const props = defineProps<{ path: string; title: string }>()
const emit = defineEmits<{ close: []; rerecord: [] }>()

const url = ref<string | null>(null)
const missing = ref(false)

watch(
  () => props.path,
  async (path) => {
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = null
    const file = await readFile(path)
    missing.value = !file
    if (file) url.value = URL.createObjectURL(file)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (url.value) URL.revokeObjectURL(url.value)
})
</script>

<template>
  <div class="backdrop" role="dialog" aria-modal="true" :aria-label="title" @click.self="emit('close')">
    <div class="sheet">
      <header>
        <strong>{{ title }}</strong>
        <button class="ghost small" @click="emit('close')">Fechar</button>
      </header>
      <video v-if="url" :src="url" controls playsinline autoplay />
      <p v-else-if="missing">Este take não está mais no aparelho.</p>
      <footer>
        <button @click="emit('rerecord')">Regravar este trecho</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgb(0 0 0 / 0.7);
  display: grid;
  place-items: center;
  padding: 1rem;
}
.sheet {
  width: min(520px, 100%);
  background: var(--surface);
  border-radius: 16px;
  padding: 1rem;
  display: grid;
  gap: 0.75rem;
}
header,
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
footer {
  justify-content: flex-end;
}
video {
  width: 100%;
  max-height: 60vh;
  background: #000;
  border-radius: 10px;
}
</style>
