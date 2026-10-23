import * as Comlink from 'comlink'
import type { OpfsWriterApi } from '../workers/opfs-writer.worker'
import { exists, getDir, getFileHandle, readFile, removeEntry, supportsCreateWritable } from './opfs-core'

/*
 * Leitura, escrita e limpeza de arquivos locais (OPFS) na thread principal.
 * Onde `createWritable` não existe (Safari antigo), a escrita vai para um Worker
 * auxiliar que usa sync access handles.
 */

export { exists, readFile, removeEntry }

let writer: Comlink.Remote<OpfsWriterApi> | null = null
function writerWorker() {
  writer ??= Comlink.wrap<OpfsWriterApi>(new Worker(new URL('../workers/opfs-writer.worker.ts', import.meta.url), { type: 'module' }))
  return writer
}

export async function isOpfsAvailable(): Promise<boolean> {
  try {
    await navigator.storage.getDirectory()
    return true
  } catch {
    return false
  }
}

export async function writeFile(path: string, data: Blob | Uint8Array): Promise<void> {
  if (supportsCreateWritable()) {
    const handle = (await getFileHandle(path, true))!
    const w = await handle.createWritable()
    await w.write(data as Blob)
    await w.close()
    return
  }
  const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data
  await writerWorker().write(path, Comlink.transfer(bytes, [bytes.buffer]), 0, true)
}

export interface AppendWriter {
  append(chunk: Blob): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
  readonly size: number
}

/** Escritor sequencial: o gravador manda cada pedaço do MediaRecorder direto para o disco. */
export async function openAppendWriter(path: string): Promise<AppendWriter> {
  let size = 0
  // Serializa as escritas: os eventos do MediaRecorder podem chegar antes da anterior terminar.
  let queue: Promise<void> = Promise.resolve()

  if (supportsCreateWritable()) {
    const handle = (await getFileHandle(path, true))!
    const w = await handle.createWritable({ keepExistingData: false })
    return {
      get size() {
        return size
      },
      append(chunk) {
        size += chunk.size
        queue = queue.then(() => w.write(chunk))
        return queue
      },
      async close() {
        await queue
        await w.close()
      },
      async abort() {
        await queue.catch(() => {})
        await w.abort()
        await removeEntry(path)
      },
    }
  }

  const remote = writerWorker()
  await remote.write(path, new Uint8Array(0), 0, true)
  return {
    get size() {
      return size
    },
    append(chunk) {
      const at = size
      size += chunk.size
      queue = queue.then(async () => {
        const bytes = new Uint8Array(await chunk.arrayBuffer())
        await remote.write(path, Comlink.transfer(bytes, [bytes.buffer]), at, false)
      })
      return queue
    },
    async close() {
      await queue
    },
    async abort() {
      await queue.catch(() => {})
      await removeEntry(path)
    },
  }
}

/** Lista os arquivos de um diretório (não recursivo). */
export async function listFiles(dirPath: string): Promise<string[]> {
  const dir = await getDir(dirPath.split('/').filter(Boolean), false)
  if (!dir) return []
  const names: string[] = []
  for await (const [name, handle] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (handle.kind === 'file') names.push(name)
  }
  return names
}

/** Remove takes que não são mais referenciados pelo projeto. */
export async function pruneTakes(keep: Set<string>): Promise<number> {
  let removed = 0
  for (const name of await listFiles('takes')) {
    const path = `takes/${name}`
    if (!keep.has(path)) {
      await removeEntry(path)
      removed++
    }
  }
  return removed
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

/** Pede armazenamento persistente para o navegador não apagar os takes sob pressão de espaço. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
