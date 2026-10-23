<script setup lang="ts">
import type { Card } from '@takeslot/schema'
import LayerList from './LayerList.vue'

/** Abertura ou encerramento: fundo de cor ou degradê, com textos e imagens. */
const card = defineModel<Card>({ required: true })
defineProps<{ names: Record<string, string> }>()

function setType(type: 'color' | 'gradient') {
  const current = card.value.background
  const color = current.type === 'color' ? current.color : current.from
  card.value.background = type === 'color' ? { type, color } : { type, from: color, to: '#ff5a36', angle: 20 }
}
</script>

<template>
  <div class="editor">
    <div class="fields">
      <label class="field"><span>Duração (s)</span><input v-model.number="card.duration" type="number" min="0.5" max="15" step="0.5" /></label>
      <label class="field">
        <span>Fundo</span>
        <select :value="card.background.type" @change="setType(($event.target as HTMLSelectElement).value as 'color')">
          <option value="color">Cor sólida</option>
          <option value="gradient">Degradê</option>
        </select>
      </label>
      <template v-if="card.background.type === 'color'">
        <label class="field"><span>Cor</span><input v-model="card.background.color" type="color" /></label>
      </template>
      <template v-else>
        <label class="field"><span>De</span><input v-model="card.background.from" type="color" /></label>
        <label class="field"><span>Para</span><input v-model="card.background.to" type="color" /></label>
        <label class="field"><span>Ângulo ({{ card.background.angle }}°)</span><input v-model.number="card.background.angle" type="range" min="0" max="360" step="5" /></label>
      </template>
    </div>
    <LayerList v-model="card.layers" :names="names" />
  </div>
</template>

<style scoped>
.editor {
  display: grid;
  gap: 0.75rem;
}
</style>
