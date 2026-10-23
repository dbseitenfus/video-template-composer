import type { StreamTargetChunk } from 'mediabunny'
import type { ExportStorage } from './export'

/** Armazenamento em memória: usado no benchmark e nos testes. */
export class MemoryStorage implements ExportStorage {
  readonly files = new Map<string, Uint8Array>()

  async read(path: string): Promise<Blob | null> {
    const data = this.files.get(path)
    return data ? new Blob([data as Uint8Array<ArrayBuffer>]) : null
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, data.slice())
  }

  async openWritable(path: string): Promise<WritableStream<StreamTargetChunk>> {
    let buffer = new Uint8Array(1 << 20)
    let size = 0
    return new WritableStream<StreamTargetChunk>({
      write: ({ data, position }) => {
        const end = position + data.byteLength
        if (end > buffer.length) {
          const grown = new Uint8Array(Math.max(end, buffer.length * 2))
          grown.set(buffer.subarray(0, size))
          buffer = grown
        }
        buffer.set(data, position)
        size = Math.max(size, end)
      },
      close: () => {
        this.files.set(path, buffer.slice(0, size))
      },
    })
  }

  async remove(path: string): Promise<void> {
    for (const key of [...this.files.keys()]) if (key === path || key.startsWith(`${path}/`)) this.files.delete(key)
  }
}
