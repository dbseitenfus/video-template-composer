import * as Comlink from 'comlink'
import { onScopeDispose } from 'vue'
import { buildTimeline, decodeAudioUrl, decodeTakeAudio, loadImageBitmaps, mixAudio, pickResolution, type ExportJob } from '@takeslot/engine'
import { templateAssets, type Resolution } from '@takeslot/schema'
import type { ExportWorkerApi } from '../workers/export.worker'
import { readFile } from '../lib/opfs'
import { reportError } from '../lib/telemetry'
import { useExportStore } from '../stores/export'
import { useProjectStore } from '../stores/project'
import { site } from '../site'
import { track } from '../lib/analytics'

/**
 * Id determinístico: mesmo template + mesmos takes = mesmo trabalho, o que permite retomar.
 * A resolução fica de fora; se ela mudar, o manifesto do trabalho não confere e os pedaços são refeitos.
 */
export function jobIdFor(templateId: string, takeIds: string[]): string {
  const key = `${templateId}|${[...takeIds].sort().join(',')}`
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return `${templateId}-${(h >>> 0).toString(36)}`
}

/** Ponte tipada com o Worker de exportação. A preparação de áudio e imagens roda aqui, na thread principal. */
export function useExport() {
  const project = useProjectStore()
  const store = useExportStore()
  let worker: Worker | null = null
  let api: Comlink.Remote<ExportWorkerApi> | null = null

  function connect() {
    worker?.terminate()
    worker = new Worker(new URL('../workers/export.worker.ts', import.meta.url), { type: 'module' })
    api = Comlink.wrap<ExportWorkerApi>(worker)
    return api
  }

  async function prepareJob(resolution: Resolution): Promise<ExportJob> {
    const entry = project.entry
    if (!entry) throw new Error('Nenhum template selecionado')
    const { template } = entry
    const timeline = buildTimeline(template, project.takeDurations)

    const takePaths: Record<string, string> = {}
    const takeAudio: Record<string, AudioBuffer | null> = {}
    for (const slot of template.slots) {
      const take = project.takes[slot.id]!
      takePaths[slot.id] = take.path
      const file = await readFile(take.path)
      if (!file) throw new Error(`O take de "${slot.label}" não está mais no aparelho. Grave de novo.`)
      takeAudio[slot.id] = await decodeTakeAudio(file)
    }
    // Clipes fixos: baixados aqui (com cache do service worker) e enviados ao Worker como Blob.
    const clipFiles: Record<string, Blob> = {}
    const clipAudio: Record<string, AudioBuffer | null> = {}
    for (const clip of template.clips) {
      const response = await fetch(entry.assets[clip.asset]!)
      if (!response.ok) throw new Error(`Não foi possível baixar o vídeo "${clip.label}"`)
      clipFiles[clip.id] = await response.blob()
      clipAudio[clip.id] = clip.volume > 0 ? await decodeTakeAudio(clipFiles[clip.id]!) : null
    }

    const music = template.music ? await decodeAudioUrl(entry.assets[template.music.asset]!) : null
    const audio = await mixAudio({ template, timeline, takes: takeAudio, clips: clipAudio, music })

    const { images } = templateAssets(template)
    const bitmaps = await loadImageBitmaps(Object.fromEntries(images.map((name) => [name, entry.assets[name]!])))

    return {
      id: jobIdFor(template.id, Object.values(project.takes).map((t) => t.id)),
      template,
      takeDurations: project.takeDurations,
      takePaths,
      clipFiles,
      resolution,
      watermark: site.watermark,
      images: bitmaps,
      audio,
    }
  }

  /**
   * Prepara, mede o aparelho e exporta.
   * @param resume retoma o trabalho salvo (sem benchmark, na resolução já escolhida)
   */
  async function start(preferred: Resolution, { resume = false } = {}) {
    const template = project.template
    if (!template) return
    store.error = null
    store.result = null
    store.progress = null
    store.autoDowngraded = false
    store.status = 'preparing'
    store.pending = true
    let phase = 'preparing'
    if (!resume) track('export_started', template.id)
    try {
      const remote = connect()
      let resolution = resume && store.resolution ? store.resolution : preferred
      const job = await prepareJob(resolution)
      await remote.setJob(Comlink.transfer(job, [...Object.values(job.images), ...(job.audio?.channels.map((c) => c.buffer as ArrayBuffer) ?? [])]))

      if (!resume) {
        store.status = phase = 'benchmarking'
        const bench = await remote.benchmark(resolution, 2)
        store.benchmark = bench
        const picked = pickResolution(bench, template.resolutions)
        store.autoDowngraded = picked !== resolution
        resolution = picked
      }

      store.resolution = resolution
      store.jobId = job.id
      store.status = phase = 'exporting'
      const result = await remote.run(
        resolution,
        Comlink.proxy((p) => {
          store.progress = p
        }),
      )
      store.result = result
      store.status = 'done'
      store.pending = false
      track('export_done', template.id)
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        store.status = 'canceled'
        store.pending = false
      } else {
        store.status = 'error'
        store.pending = false
        track('export_failed', template.id)
        store.error = (e as Error)?.message ?? String(e)
        reportError(e, { phase, template: template.id })
      }
    } finally {
      worker?.terminate()
      worker = null
      api = null
    }
  }

  async function cancel() {
    await api?.cancel()
  }

  /** Apaga os arquivos da exportação atual e volta ao estado inicial. */
  async function discard() {
    const jobId = store.jobId
    store.reset()
    store.jobId = null
    if (!jobId) return
    const remote = connect()
    try {
      await remote.discard(jobId)
    } finally {
      worker?.terminate()
      worker = null
    }
  }

  async function resultFile(): Promise<File | null> {
    const result = store.result
    if (!result) return null
    const file = await readFile(result.path)
    if (!file) return null
    const name = `${project.template?.id ?? 'video'}-${new Date().toISOString().slice(0, 10)}.mp4`
    return new File([file], name, { type: result.mimeType })
  }

  onScopeDispose(() => worker?.terminate())
  return { start, cancel, discard, resultFile }
}
