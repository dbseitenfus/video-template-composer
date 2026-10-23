<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import SlotList from '../components/SlotList.vue'
import TakeReview from '../components/TakeReview.vue'
import { useProjectStore } from '../stores/project'
import { formatBytes } from '../lib/format'
import { storageEstimate } from '../lib/opfs'

const router = useRouter()
const project = useProjectStore()
const watching = ref<string | null>(null)
const storage = ref<{ usage: number; quota: number } | null>(null)

const template = computed(() => project.template!)
const watchingSlot = computed(() => template.value.slots.find((s) => s.id === watching.value) ?? null)
const tooShort = computed(() => template.value.slots.filter((s) => project.slotStatus(s.id) === 'too-short'))

onMounted(async () => {
  await project.verifyTakes()
  storage.value = await storageEstimate()
})

function record(slotId: string) {
  watching.value = null
  void router.push({ name: 'record', params: { slot: slotId } })
}
</script>

<template>
  <main class="page">
    <section>
      <h1>{{ template.name }}</h1>
      <p class="muted">Grave os trechos na ordem que preferir. Qualquer take pode ser regravado antes de montar.</p>
    </section>

    <SlotList :slots="template.slots" :takes="project.takes" :status="project.slotStatus" @record="record" @watch="watching = $event" />

    <p v-if="tooShort.length" class="warn">
      {{ tooShort.map((s) => s.label).join(', ') }}: take mais curto que o mínimo sugerido. Dá para montar assim mesmo, mas vale regravar.
    </p>

    <div class="row actions">
      <button v-if="project.nextEmptySlot" @click="record(project.nextEmptySlot.id)">Gravar “{{ project.nextEmptySlot.label }}”</button>
      <button :class="{ ghost: !project.allRecorded }" :disabled="!project.allRecorded" data-testid="go-export" @click="router.push({ name: 'export' })">
        Montar o vídeo
      </button>
    </div>

    <p v-if="storage" class="muted small">Espaço usado no aparelho: {{ formatBytes(storage.usage) }} de {{ formatBytes(storage.quota) }}</p>

    <TakeReview
      v-if="watchingSlot && project.takes[watchingSlot.id]"
      :path="project.takes[watchingSlot.id]!.path"
      :title="watchingSlot.label"
      @close="watching = null"
      @rerecord="record(watchingSlot.id)"
    />
  </main>
</template>

<style scoped>
h1 {
  margin: 0.25rem 0;
}
.actions {
  justify-content: flex-end;
}
.small {
  font-size: 0.8rem;
}
</style>
