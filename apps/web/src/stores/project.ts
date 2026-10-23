import { defineStore } from 'pinia'
import { computed, ref, shallowRef, toRaw, watch } from 'vue'
import { findTemplate, type TemplateEntry } from '@takeslot/templates'
import { exists, removeEntry } from '../lib/opfs'
import { loadJson, saveJson } from '../lib/storage'

/** Metadados de um take. O vídeo em si fica no OPFS e é lido sob demanda. */
export interface TakeMeta {
  id: string
  slotId: string
  path: string
  mimeType: string
  duration: number
  size: number
  createdAt: number
  thumbnail: string | null
}

export type SlotStatus = 'empty' | 'recorded' | 'too-short'

const STORAGE_KEY = 'takeslot:project'

interface Persisted {
  /**
   * Cópia do template em uso. Guardar a cópia (e não só o id) mantém os takes válidos
   * mesmo se o admin publicar uma versão nova no meio da gravação.
   */
  entry?: TemplateEntry | null
  /** Formato antigo: só o id de um template embutido. */
  templateId?: string | null
  takes: Record<string, TakeMeta>
}

export const useProjectStore = defineStore('project', () => {
  const saved = loadJson<Persisted>(STORAGE_KEY, { entry: null, takes: {} })
  // shallowRef: a cópia do template não é editada aqui, e um proxy reativo não pode ser enviado ao Worker.
  const entry = shallowRef<TemplateEntry | null>(saved.entry ?? (saved.templateId ? findTemplate(saved.templateId) ?? null : null))
  const takes = ref<Record<string, TakeMeta>>(saved.takes)

  watch([entry, takes], () => saveJson(STORAGE_KEY, { entry: entry.value, takes: takes.value }), { deep: true })

  const templateId = computed(() => entry.value?.template.id ?? null)
  const template = computed(() => entry.value?.template ?? null)

  function slotStatus(slotId: string): SlotStatus {
    const take = takes.value[slotId]
    if (!take) return 'empty'
    const slot = template.value?.slots.find((s) => s.id === slotId)
    return slot && take.duration < slot.minDuration ? 'too-short' : 'recorded'
  }

  const recordedCount = computed(() => template.value?.slots.filter((s) => takes.value[s.id]).length ?? 0)
  const allRecorded = computed(() => !!template.value && recordedCount.value === template.value.slots.length)
  const nextEmptySlot = computed(() => template.value?.slots.find((s) => !takes.value[s.id]) ?? null)
  const takeDurations = computed(() => Object.fromEntries(Object.entries(takes.value).map(([id, t]) => [id, t.duration])))

  /** Seleciona um template do catálogo. Trocar de template ou de versão apaga os takes. */
  async function selectTemplate(next: TemplateEntry) {
    const same = templateId.value === next.template.id && entry.value?.version === next.version
    if (!same) await clearTakes()
    entry.value = toRaw(next)
  }

  async function saveTake(take: TakeMeta) {
    const previous = takes.value[take.slotId]
    takes.value = { ...takes.value, [take.slotId]: take }
    if (previous && previous.path !== take.path) await removeEntry(previous.path)
  }

  async function removeTake(slotId: string) {
    const take = takes.value[slotId]
    if (!take) return
    const { [slotId]: _, ...rest } = takes.value
    takes.value = rest
    await removeEntry(take.path)
  }

  async function clearTakes() {
    const paths = Object.values(takes.value).map((t) => t.path)
    takes.value = {}
    await Promise.all(paths.map((p) => removeEntry(p).catch(() => {})))
  }

  /** Descarta metadados de takes cujo arquivo sumiu (armazenamento limpo pelo navegador). */
  async function verifyTakes(): Promise<string[]> {
    const lost: string[] = []
    for (const [slotId, take] of Object.entries(takes.value)) {
      if (!(await exists(take.path).catch(() => false))) lost.push(slotId)
    }
    if (lost.length) takes.value = Object.fromEntries(Object.entries(takes.value).filter(([id]) => !lost.includes(id)))
    return lost
  }

  return {
    templateId,
    takes,
    entry,
    template,
    slotStatus,
    recordedCount,
    allRecorded,
    nextEmptySlot,
    takeDurations,
    selectTemplate,
    saveTake,
    removeTake,
    clearTakes,
    verifyTakes,
  }
})
