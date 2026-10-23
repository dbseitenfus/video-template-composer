<script setup lang="ts">
import type { Slot } from '@takeslot/schema'
import LayerList from './LayerList.vue'

/** Trecho que o usuário grava: roteiro do teleprompter, limites de duração e enquadramento. */
const slot = defineModel<Slot>({ required: true })
defineProps<{ names: Record<string, string> }>()
</script>

<template>
  <div class="editor">
    <div class="fields">
      <label class="field wide"><span>Nome do trecho</span><input v-model="slot.label" data-testid="slot-label" /></label>
      <label class="field wide"><span>Roteiro (teleprompter)</span><textarea v-model="slot.script" rows="4" /></label>
      <label class="field"><span>Duração mínima (s)</span><input v-model.number="slot.minDuration" type="number" min="0" step="1" /></label>
      <label class="field"><span>Duração máxima (s)</span><input v-model.number="slot.maxDuration" type="number" min="1" max="120" step="1" /></label>
      <label class="field">
        <span>Enquadramento</span>
        <select v-model="slot.fit">
          <option value="cover">Preencher (corta as bordas)</option>
          <option value="contain">Mostrar inteiro (com bordas)</option>
        </select>
      </label>
      <label v-if="slot.fit === 'contain'" class="field"><span>Cor das bordas</span><input v-model="slot.background" type="color" /></label>
    </div>
    <LayerList v-model="slot.layers" :names="names" />
  </div>
</template>

<style scoped>
.editor {
  display: grid;
  gap: 0.75rem;
}
</style>
