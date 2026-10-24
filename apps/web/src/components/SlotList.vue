<script setup lang="ts">
import type { SequenceItem } from '@takeslot/schema'
import type { SlotStatus, TakeMeta } from '../stores/project'
import { formatDuration } from '../lib/format'

/** Sequência do vídeo: trechos a gravar e, entre eles, os vídeos prontos do modelo. */
defineProps<{
  items: SequenceItem[]
  takes: Record<string, TakeMeta>
  status: (slotId: string) => SlotStatus
}>()

defineEmits<{
  record: [slotId: string]
  watch: [slotId: string]
  watchClip: [clipId: string]
}>()
</script>

<template>
  <ol class="slots">
    <template v-for="(item, i) in items" :key="item.kind === 'slot' ? item.slot.id : `clip-${item.clip.id}`">
      <li v-if="item.kind === 'slot'" :class="status(item.slot.id)" :data-testid="`slot-${item.slot.id}`">
        <div class="thumb">
          <img v-if="takes[item.slot.id]?.thumbnail" :src="takes[item.slot.id]!.thumbnail!" alt="" />
          <span v-else>{{ i + 1 }}</span>
        </div>
        <div class="info">
          <strong>{{ item.slot.label }}</strong>
          <small v-if="takes[item.slot.id]">
            {{ formatDuration(takes[item.slot.id]!.duration) }}
            <template v-if="takes[item.slot.id]!.duration > item.slot.maxDuration"> · será cortado em {{ formatDuration(item.slot.maxDuration) }}</template>
            <template v-if="status(item.slot.id) === 'too-short'"> · curto demais (mín. {{ item.slot.minDuration }} s)</template>
          </small>
          <small v-else>Até {{ formatDuration(item.slot.maxDuration) }} · ainda não gravado</small>
        </div>
        <div class="actions">
          <button v-if="takes[item.slot.id]" class="ghost small" @click="$emit('watch', item.slot.id)">Assistir</button>
          <button class="small" :class="{ ghost: !!takes[item.slot.id] }" @click="$emit('record', item.slot.id)">
            {{ takes[item.slot.id] ? 'Regravar' : 'Gravar' }}
          </button>
        </div>
      </li>
      <li v-else class="clip" :data-testid="`clip-${item.clip.id}`">
        <div class="thumb clip-thumb" aria-hidden="true">▶</div>
        <div class="info">
          <strong>{{ item.clip.label }}</strong>
          <small>Vídeo pronto · {{ formatDuration(item.clip.duration) }} · já faz parte do modelo</small>
        </div>
        <div class="actions">
          <button class="ghost small" @click="$emit('watchClip', item.clip.id)">Assistir</button>
        </div>
      </li>
    </template>
  </ol>
</template>

<style scoped>
.slots {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}
li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem;
  background: var(--surface);
  border-radius: 12px;
  border: 1px solid var(--border);
}
li.clip {
  background: transparent;
  border-style: dashed;
}
.clip-thumb {
  color: var(--ok);
  font-size: 1.3rem;
}
li.too-short {
  border-color: var(--warn);
}
.thumb {
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--surface-2);
  font-weight: 700;
  color: var(--muted);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.info {
  flex: 1;
  min-width: 0;
  display: grid;
}
.info small {
  color: var(--muted);
}
li.too-short small {
  color: var(--warn);
}
.actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}
</style>
