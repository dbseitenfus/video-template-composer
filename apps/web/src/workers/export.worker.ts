import * as Comlink from 'comlink'
import type { StreamTargetChunk } from 'mediabunny'
import { benchmark, runExport, type BenchmarkResult, type ExportJob, type ExportProgress, type ExportResult, type ExportStorage } from '@takeslot/engine'
import type { Resolution } from '@takeslot/schema'
import { openSyncHandle, readFile, removeEntry, writeFileInWorker } from '../lib/opfs-core'

/** Armazenamento OPFS do Worker: escrita com sync access handle, que funciona em todos os navegadores-alvo. */
const storage: ExportStorage = {
  read: (path) => readFile(path),
  write: (path, data) => writeFileInWorker(path, data),
  remove: (path) => removeEntry(path),
  async openWritable(path) {
    const handle = await openSyncHandle(path, true)
    return new WritableStream<StreamTargetChunk>({
      write({ data, position }) {
        handle.write(data, { at: position })
      },
      close() {
        handle.flush()
        handle.close()
      },
      abort() {
        handle.close()
      },
    })
  },
}

let job: ExportJob | null = null
let controller: AbortController | null = null

const api = {
  /** Recebe o trabalho uma vez (as imagens são transferidas e não podem ser reenviadas). */
  setJob(next: ExportJob) {
    job = next
  },

  async benchmark(resolution: Resolution, seconds = 2): Promise<BenchmarkResult> {
    if (!job) throw new Error('Trabalho de exportação não configurado')
    return benchmark({ ...job, resolution }, storage, seconds)
  },

  async run(resolution: Resolution, onProgress: (p: ExportProgress) => void): Promise<ExportResult> {
    if (!job) throw new Error('Trabalho de exportação não configurado')
    controller = new AbortController()
    try {
      return await runExport({ ...job, resolution }, storage, onProgress, controller.signal)
    } finally {
      controller = null
    }
  },

  cancel() {
    controller?.abort()
  },

  /** Apaga os arquivos de uma exportação (pedaços, áudio e MP4 final). */
  async discard(jobId: string) {
    await removeEntry(`exports/${jobId}`)
  },
}

export type ExportWorkerApi = typeof api

Comlink.expose(api)
