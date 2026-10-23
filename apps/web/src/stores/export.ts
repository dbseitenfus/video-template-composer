import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { BenchmarkResult, ExportProgress, ExportResult } from '@takeslot/engine'
import type { Resolution } from '@takeslot/schema'
import { loadJson, saveJson } from '../lib/storage'

export type ExportStatus = 'idle' | 'preparing' | 'benchmarking' | 'exporting' | 'done' | 'error' | 'canceled'

const STORAGE_KEY = 'takeslot:export'

interface Persisted {
  jobId: string | null
  resolution: Resolution | null
  /** `true` enquanto há uma exportação sem terminar (para retomar ao reabrir). */
  pending: boolean
  result: ExportResult | null
}

export const useExportStore = defineStore('export', () => {
  const saved = loadJson<Persisted>(STORAGE_KEY, { jobId: null, resolution: null, pending: false, result: null })

  const status = ref<ExportStatus>(saved.result ? 'done' : 'idle')
  const jobId = ref<string | null>(saved.jobId)
  const resolution = ref<Resolution | null>(saved.resolution)
  const pending = ref(saved.pending)
  const progress = ref<ExportProgress | null>(null)
  const benchmark = ref<BenchmarkResult | null>(null)
  const result = ref<ExportResult | null>(saved.result)
  const error = ref<string | null>(null)
  const autoDowngraded = ref(false)

  watch([jobId, resolution, pending, result], () =>
    saveJson(STORAGE_KEY, { jobId: jobId.value, resolution: resolution.value, pending: pending.value, result: result.value }),
  )

  function reset() {
    status.value = 'idle'
    progress.value = null
    benchmark.value = null
    result.value = null
    error.value = null
    pending.value = false
    autoDowngraded.value = false
  }

  return { status, jobId, resolution, pending, progress, benchmark, result, error, autoDowngraded, reset }
})
