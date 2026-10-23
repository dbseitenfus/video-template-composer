<script setup lang="ts">
import { computed, ref } from 'vue'
import { applySequence, moveItem, templateSequence, type SequenceItem, type Template } from '@takeslot/schema'
import type { Asset } from '../api'
import { newCard, newClip, newSlot } from '../templates'
import { formatDuration } from '../../lib/format'
import AssetPicker from './AssetPicker.vue'
import CardEditor from './CardEditor.vue'
import ClipEditor from './ClipEditor.vue'
import Modal from './Modal.vue'
import SlotEditor from './SlotEditor.vue'

/**
 * Ordem do vídeo: abertura, uma lista livre de trechos gravados e vídeos pré-gravados,
 * e encerramento. A lista é convertida para `slots` + `clips[].after` com `applySequence`.
 */
const template = defineModel<Template>({ required: true })
defineProps<{ names: Record<string, string>; assets: Record<string, Asset> }>()

/** Item aberto para edição: 'intro', 'outro' ou o id do slot/clipe. */
const open = ref<string | null>(null)
const pickingClip = ref(false)
const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)

const items = computed(() => templateSequence(template.value))
const keyOf = (item: SequenceItem) => (item.kind === 'slot' ? item.slot.id : item.clip.id)

function setItems(next: SequenceItem[]) {
  const updated = applySequence(template.value, next)
  template.value.slots = updated.slots
  template.value.clips = updated.clips
}

function move(from: number, to: number) {
  setItems(moveItem(items.value, from, to))
}

function remove(index: number) {
  const item = items.value[index]!
  const what = item.kind === 'slot' ? `o trecho “${item.slot.label}”` : `o vídeo “${item.clip.label}”`
  if (!confirm(`Remover ${what}?`)) return
  setItems(items.value.filter((_, i) => i !== index))
}

function addSlot() {
  const slot = newSlot(template.value)
  setItems([...items.value, { kind: 'slot', slot }])
  open.value = slot.id
}

function addClip(asset: Asset) {
  pickingClip.value = false
  const clip = newClip(template.value, asset)
  setItems([...items.value, { kind: 'clip', clip }])
  open.value = clip.id
}

function toggle(key: string) {
  open.value = open.value === key ? null : key
}

function onDrop(index: number) {
  if (dragFrom.value !== null) move(dragFrom.value, index)
  dragFrom.value = dragOver.value = null
}

function summary(item: SequenceItem) {
  return item.kind === 'slot'
    ? `${formatDuration(item.slot.minDuration)}–${formatDuration(item.slot.maxDuration)}`
    : formatDuration(item.clip.duration)
}

const total = computed(() => {
  const t = template.value
  const fixed = (t.intro?.duration ?? 0) + (t.outro?.duration ?? 0) + t.clips.reduce((s, c) => s + c.duration, 0)
  return { min: fixed + t.slots.reduce((s, x) => s + x.minDuration, 0), max: fixed + t.slots.reduce((s, x) => s + x.maxDuration, 0) }
})
</script>

<template>
  <div class="sequence">
    <p class="muted small">
      Arraste ou use as setas para definir a ordem. Duração total entre {{ formatDuration(total.min) }} e {{ formatDuration(total.max) }}.
    </p>

    <!-- Abertura -->
    <div class="item fixed" :class="{ off: !template.intro }">
      <div class="row line">
        <span class="badge">Abertura</span>
        <strong class="label">{{ template.intro ? `Cartão de ${template.intro.duration} s` : 'Sem abertura' }}</strong>
        <button v-if="template.intro" class="ghost small" type="button" @click="toggle('intro')">{{ open === 'intro' ? 'Fechar' : 'Editar' }}</button>
        <button class="ghost small" type="button" @click="template.intro = template.intro ? undefined : newCard(template.name)">
          {{ template.intro ? 'Remover' : 'Adicionar' }}
        </button>
      </div>
      <CardEditor v-if="template.intro && open === 'intro'" v-model="template.intro" :names="names" />
    </div>

    <ol class="list" data-testid="sequence">
      <li
        v-for="(item, i) in items"
        :key="keyOf(item)"
        class="item"
        :class="[item.kind, { over: dragOver === i && dragFrom !== i }]"
        :data-testid="`seq-${keyOf(item)}`"
        @dragover.prevent="dragOver = i"
        @dragleave="dragOver = null"
        @drop.prevent="onDrop(i)"
      >
        <div class="row line">
          <span class="handle" draggable="true" title="Arrastar" aria-hidden="true" @dragstart="dragFrom = i" @dragend="dragFrom = dragOver = null">⋮⋮</span>
          <span class="index">{{ i + 1 }}</span>
          <span class="badge" :class="item.kind === 'slot' ? 'accent' : 'ok'">{{ item.kind === 'slot' ? 'Gravado pelo usuário' : 'Vídeo pronto' }}</span>
          <strong class="label">{{ item.kind === 'slot' ? item.slot.label : item.clip.label }}</strong>
          <span class="muted dur">{{ summary(item) }}</span>
          <div class="row tools">
            <button class="ghost small icon" type="button" :disabled="i === 0" :aria-label="`Subir ${i + 1}`" @click="move(i, i - 1)">↑</button>
            <button class="ghost small icon" type="button" :disabled="i === items.length - 1" :aria-label="`Descer ${i + 1}`" @click="move(i, i + 1)">↓</button>
            <button class="ghost small" type="button" @click="toggle(keyOf(item))">{{ open === keyOf(item) ? 'Fechar' : 'Editar' }}</button>
            <button class="ghost small" type="button" :disabled="item.kind === 'slot' && template.slots.length === 1" @click="remove(i)">Remover</button>
          </div>
        </div>
        <template v-if="open === keyOf(item)">
          <SlotEditor v-if="item.kind === 'slot'" v-model="item.slot" :names="names" />
          <ClipEditor v-else v-model="item.clip" :names="names" :assets="assets" :template="template" />
        </template>
      </li>
    </ol>

    <div class="row">
      <button class="small" type="button" data-testid="add-slot" @click="addSlot">+ Trecho gravado pelo usuário</button>
      <button class="small" type="button" data-testid="add-clip" @click="pickingClip = true">+ Vídeo pré-gravado</button>
    </div>

    <!-- Encerramento -->
    <div class="item fixed" :class="{ off: !template.outro }">
      <div class="row line">
        <span class="badge">Encerramento</span>
        <strong class="label">{{ template.outro ? `Cartão de ${template.outro.duration} s` : 'Sem encerramento' }}</strong>
        <button v-if="template.outro" class="ghost small" type="button" @click="toggle('outro')">{{ open === 'outro' ? 'Fechar' : 'Editar' }}</button>
        <button class="ghost small" type="button" @click="template.outro = template.outro ? undefined : newCard('Obrigado!')">
          {{ template.outro ? 'Remover' : 'Adicionar' }}
        </button>
      </div>
      <CardEditor v-if="template.outro && open === 'outro'" v-model="template.outro" :names="names" />
    </div>

    <Modal v-if="pickingClip" title="Escolha o vídeo pré-gravado" @close="pickingClip = false">
      <AssetPicker kind="video" selectable @select="addClip" />
    </Modal>
  </div>
</template>

<style scoped>
.sequence {
  display: grid;
  gap: 0.6rem;
}
.small {
  font-size: 0.85rem;
  margin: 0;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--border);
  border-radius: 12px;
  padding: 0.6rem 0.75rem;
  display: grid;
  gap: 0.75rem;
}
.item.slot {
  border-left-color: var(--accent);
}
.item.clip {
  border-left-color: var(--ok);
}
.item.over {
  outline: 2px dashed var(--accent);
}
.item.fixed {
  background: transparent;
}
.item.off {
  opacity: 0.65;
}
.line {
  gap: 0.5rem;
  flex-wrap: wrap;
}
.handle {
  cursor: grab;
  color: var(--muted);
  user-select: none;
  letter-spacing: -2px;
}
.index {
  font-weight: 800;
  color: var(--muted);
  min-width: 1.2rem;
}
.label {
  flex: 1;
  min-width: 120px;
}
.dur {
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.tools {
  gap: 0.3rem;
}
.icon {
  padding: 0.35rem 0.6rem;
}
</style>
