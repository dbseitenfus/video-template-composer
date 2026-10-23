import * as Comlink from 'comlink'
import { openSyncHandle } from '../lib/opfs-core'

/** Worker auxiliar de escrita no OPFS para navegadores sem `createWritable`. */
const api = {
  async write(path: string, data: Uint8Array, at: number, truncate: boolean): Promise<void> {
    const handle = await openSyncHandle(path, truncate)
    try {
      if (data.byteLength > 0) handle.write(data, { at })
      handle.flush()
    } finally {
      handle.close()
    }
  },
}

export type OpfsWriterApi = typeof api

Comlink.expose(api)
