<script setup lang="ts">
import { computed } from 'vue'
import type { Clip, Template } from '@takeslot/schema'
import type { Asset } from '../api'
import AssetField from './AssetField.vue'
import LayerList from './LayerList.vue'

/** Vídeo pré-gravado: arquivo, corte (início e duração), volume e enquadramento. */
const clip = defineModel<Clip>({ required: true })
const props = defineProps<{ names: Record<string, string>; assets: Record<string, Asset>; template: Template }>()

const asset = computed(() => props.assets[clip.value.asset])
const available = computed(() => (asset.value?.duration ? Math.max(0, asset.value.duration - clip.value.trimStart) : null))
const aspectWarning = computed(() => {
  const a = asset.value
  if (!a?.width || !a.height) return null
  const source = a.width / a.height
  const target = props.template.canvas.width / props.template.canvas.height
  if (Math.abs(source - target) < 0.02) return null
  return clip.value.fit === 'cover'
    ? 'A proporção do vídeo é diferente da do template: as bordas serão cortadas.'
    : 'A proporção do vídeo é diferente da do template: vão aparecer faixas nas bordas.'
})

function picked(a: Asset) {
  if (a.duration) clip.value.duration = Math.round(Math.min(120, a.duration) * 100) / 100
  clip.value.trimStart = 0
}
</script>

<template>
  <div class="editor">
    <div class="fields">
      <label class="field wide"><span>Nome</span><input v-model="clip.label" /></label>
      <AssetField v-model="clip.asset" class="wide" kind="video" label="Arquivo de vídeo" :names="names" @picked="picked" />
      <label class="field"><span>Começa em (s)</span><input v-model.number="clip.trimStart" type="number" min="0" step="0.1" /></label>
      <label class="field">
        <span>Duração (s){{ available !== null ? ` · até ${available.toFixed(1)}` : '' }}</span>
        <input v-model.number="clip.duration" type="number" min="0.5" max="120" step="0.1" />
      </label>
      <label class="field"><span>Volume ({{ Math.round(clip.volume * 100) }}%)</span><input v-model.number="clip.volume" type="range" min="0" max="1" step="0.05" /></label>
      <label class="check"><input v-model="clip.duckMusic" type="checkbox" /> Abaixar a trilha durante o vídeo</label>
      <label class="field">
        <span>Enquadramento</span>
        <select v-model="clip.fit">
          <option value="cover">Preencher (corta as bordas)</option>
          <option value="contain">Mostrar inteiro (com bordas)</option>
        </select>
      </label>
      <label v-if="clip.fit === 'contain'" class="field"><span>Cor das bordas</span><input v-model="clip.background" type="color" /></label>
    </div>
    <p v-if="available !== null && clip.duration > available + 0.05" class="warn small">
      O arquivo só tem {{ available.toFixed(1) }} s a partir desse ponto: o último quadro ficaria parado.
    </p>
    <p v-if="aspectWarning" class="warn small">{{ aspectWarning }}</p>
    <LayerList v-model="clip.layers" :names="names" />
  </div>
</template>

<style scoped>
.editor {
  display: grid;
  gap: 0.75rem;
}
.small {
  font-size: 0.85rem;
  margin: 0;
}
</style>
