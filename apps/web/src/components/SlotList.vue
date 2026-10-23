<script setup lang="ts">
import type { Slot } from '@takeslot/schema'
import type { SlotStatus, TakeMeta } from '../stores/project'
import { formatDuration } from '../lib/format'

defineProps<{
  slots: Slot[]
  takes: Record<string, TakeMeta>
  status: (slotId: string) => SlotStatus
}>()

defineEmits<{
  record: [slotId: string]
  watch: [slotId: string]
}>()
</script>

<template>
  <ol class="slots">
    <li v-for="(slot, i) in slots" :key="slot.id" :class="status(slot.id)" :data-testid="`slot-${slot.id}`">
      <div class="thumb">
        <img v-if="takes[slot.id]?.thumbnail" :src="takes[slot.id]!.thumbnail!" alt="" />
        <span v-else>{{ i + 1 }}</span>
      </div>
      <div class="info">
        <strong>{{ slot.label }}</strong>
        <small v-if="takes[slot.id]">
          {{ formatDuration(takes[slot.id]!.duration) }}
          <template v-if="takes[slot.id]!.duration > slot.maxDuration"> · será cortado em {{ formatDuration(slot.maxDuration) }}</template>
          <template v-if="status(slot.id) === 'too-short'"> · curto demais (mín. {{ slot.minDuration }} s)</template>
        </small>
        <small v-else>Até {{ formatDuration(slot.maxDuration) }} · ainda não gravado</small>
      </div>
      <div class="actions">
        <button v-if="takes[slot.id]" class="ghost small" @click="$emit('watch', slot.id)">Assistir</button>
        <button class="small" :class="{ ghost: !!takes[slot.id] }" @click="$emit('record', slot.id)">
          {{ takes[slot.id] ? 'Regravar' : 'Gravar' }}
        </button>
      </div>
    </li>
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
