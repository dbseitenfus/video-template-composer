/*
 * Acesso ao OPFS que funciona tanto na thread principal quanto em Workers.
 * Escrita com `createSyncAccessHandle` só existe em Workers dedicados; é o caminho
 * usado pelo Worker de exportação e pelo Worker auxiliar de escrita.
 */

interface SyncAccessHandle {
  write(buffer: AllowSharedBufferSource, options?: { at?: number }): number
  truncate(size: number): void
  getSize(): number
  flush(): void
  close(): void
}

type SyncCapableHandle = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncAccessHandle> }

export function splitPath(path: string): { dirs: string[]; name: string } {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  if (!name) throw new Error(`Caminho inválido: ${path}`)
  return { dirs: parts, name }
}

export async function getDir(dirs: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
  let dir = await navigator.storage.getDirectory()
  for (const d of dirs) {
    try {
      dir = await dir.getDirectoryHandle(d, { create })
    } catch (e) {
      if (!create && (e as DOMException).name === 'NotFoundError') return null
      throw e
    }
  }
  return dir
}

export async function getFileHandle(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
  const { dirs, name } = splitPath(path)
  const dir = await getDir(dirs, create)
  if (!dir) return null
  try {
    return await dir.getFileHandle(name, { create })
  } catch (e) {
    if (!create && ['NotFoundError', 'TypeMismatchError'].includes((e as DOMException).name)) return null
    throw e
  }
}

export async function readFile(path: string): Promise<File | null> {
  const handle = await getFileHandle(path, false)
  return handle ? handle.getFile() : null
}

export async function exists(path: string): Promise<boolean> {
  return (await getFileHandle(path, false)) !== null
}

export async function removeEntry(path: string): Promise<void> {
  const { dirs, name } = splitPath(path)
  const dir = await getDir(dirs, false)
  if (!dir) return
  try {
    await dir.removeEntry(name, { recursive: true })
  } catch (e) {
    if ((e as DOMException).name !== 'NotFoundError') throw e
  }
}

/** Abre um arquivo para escrita posicional com sync access handle (só em Workers). */
export async function openSyncHandle(path: string, truncate: boolean): Promise<SyncAccessHandle> {
  const handle = (await getFileHandle(path, true)) as SyncCapableHandle
  const access = await handle.createSyncAccessHandle()
  if (truncate) access.truncate(0)
  return access
}

/** Grava o arquivo inteiro. Usa sync access handle em Worker e `createWritable` na thread principal. */
export async function writeFileInWorker(path: string, data: Uint8Array): Promise<void> {
  const access = await openSyncHandle(path, true)
  try {
    access.write(data, { at: 0 })
    access.flush()
  } finally {
    access.close()
  }
}

export const supportsCreateWritable = () =>
  typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype
