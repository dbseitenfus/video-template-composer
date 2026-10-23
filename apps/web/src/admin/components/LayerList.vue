<script setup lang="ts">
import type { Layer } from '@takeslot/schema'
import { textLayer } from '../templates'
import AssetField from './AssetField.vue'

/** Textos e imagens por cima de um trecho, vídeo ou cartão. Tempos relativos ao início do item. */
const layers = defineModel<Layer[]>({ required: true })
defineProps<{ names: Record<string, string> }>()

function addText() {
  layers.value.push(textLayer())
}

function addImage() {
  layers.value.push({ type: 'image', asset: '', x: 0.5, y: 0.5, width: 0.4, anchor: 'center', opacity: 1, start: 0, animation: 'fade', animationDuration: 0.4 })
}

function setEnd(layer: Layer, value: string) {
  layer.end = value === '' ? undefined : Number(value)
}

function setAlign(layer: Layer & { type: 'text' }, align: 'left' | 'center' | 'right') {
  layer.align = align
  layer.x = align === 'left' ? 0.06 : align === 'right' ? 0.94 : 0.5
}
</script>

<template>
  <div class="layers">
    <div v-for="(layer, i) in layers" :key="i" class="layer">
      <div class="row top">
        <span class="badge">{{ layer.type === 'text' ? 'Texto' : 'Imagem' }}</span>
        <button class="ghost small" type="button" @click="layers.splice(i, 1)">Remover</button>
      </div>
      <div class="fields">
        <template v-if="layer.type === 'text'">
          <label class="field wide"><span>Texto</span><input v-model="layer.text" placeholder="Use {{slot.label}} para o nome do trecho" /></label>
          <label class="field">
            <span>Alinhamento</span>
            <select :value="layer.align" @change="setAlign(layer, ($event.target as HTMLSelectElement).value as 'left')">
              <option value="left">Esquerda</option>
              <option value="center">Centro</option>
              <option value="right">Direita</option>
            </select>
          </label>
          <label class="field"><span>Altura na tela ({{ Math.round(layer.y * 100) }}%)</span><input v-model.number="layer.y" type="range" min="0.03" max="0.97" step="0.01" /></label>
          <label class="field"><span>Tamanho ({{ (layer.fontSize * 100).toFixed(1) }})</span><input v-model.number="layer.fontSize" type="range" min="0.015" max="0.12" step="0.001" /></label>
          <label class="field"><span>Cor</span><input v-model="layer.color" type="color" /></label>
          <label class="check">
            <input type="checkbox" :checked="!!layer.background" @change="layer.background = ($event.target as HTMLInputElement).checked ? { color: '#ff5a36', padding: 0.012, radius: 0.008 } : undefined" />
            Faixa de fundo
          </label>
          <label v-if="layer.background" class="field"><span>Cor da faixa</span><input v-model="layer.background.color" type="color" /></label>
        </template>
        <template v-else>
          <AssetField v-model="layer.asset" class="wide" kind="image" label="Imagem" :names="names" />
          <label class="field"><span>Horizontal ({{ Math.round(layer.x * 100) }}%)</span><input v-model.number="layer.x" type="range" min="0" max="1" step="0.01" /></label>
          <label class="field"><span>Vertical ({{ Math.round(layer.y * 100) }}%)</span><input v-model.number="layer.y" type="range" min="0" max="1" step="0.01" /></label>
          <label class="field"><span>Largura ({{ Math.round(layer.width * 100) }}%)</span><input v-model.number="layer.width" type="range" min="0.05" max="1" step="0.01" /></label>
        </template>
        <label class="field"><span>Aparece em (s)</span><input v-model.number="layer.start" type="number" min="0" step="0.1" /></label>
        <label class="field">
          <span>Some em (s)</span>
          <input :value="layer.end ?? ''" type="number" step="0.1" placeholder="no fim" @input="setEnd(layer, ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="field">
          <span>Animação</span>
          <select v-model="layer.animation">
            <option value="none">Nenhuma</option>
            <option value="fade">Aparecer</option>
            <option value="slide-up">Subir</option>
            <option value="pop">Crescer</option>
          </select>
        </label>
      </div>
    </div>
    <div class="row">
      <button class="ghost small" type="button" @click="addText">+ Texto</button>
      <button class="ghost small" type="button" @click="addImage">+ Imagem</button>
    </div>
  </div>
</template>

<style scoped>
.layers {
  display: grid;
  gap: 0.6rem;
}
.layer {
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 0.6rem;
  display: grid;
  gap: 0.6rem;
}
.top {
  justify-content: space-between;
}
</style>
