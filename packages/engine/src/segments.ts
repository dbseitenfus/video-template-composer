/** Pedaço da exportação que vira um MP4 próprio no OPFS (checkpoint). */
export interface ExportChunk {
  index: number
  startFrame: number
  /** Exclusivo. */
  endFrame: number
}

/**
 * Divide o vídeo em pedaços de ~`chunkSeconds`. Cada pedaço começa num keyframe,
 * então os MP4 podem ser unidos depois sem recodificar.
 */
export function planChunks(totalFrames: number, fps: number, chunkSeconds: number): ExportChunk[] {
  const size = Math.max(1, Math.round(chunkSeconds * fps))
  const chunks: ExportChunk[] = []
  for (let start = 0, index = 0; start < totalFrames; start += size, index++) {
    chunks.push({ index, startFrame: start, endFrame: Math.min(totalFrames, start + size) })
  }
  // Evita um último pedaço minúsculo: junta com o anterior se tiver menos de 1/4 do tamanho.
  const last = chunks[chunks.length - 1]
  const prev = chunks[chunks.length - 2]
  if (last && prev && last.endFrame - last.startFrame < size / 4) {
    prev.endFrame = last.endFrame
    chunks.pop()
  }
  return chunks
}

/** Intercala vários fluxos já ordenados por timestamp num único fluxo ordenado. */
export async function* mergeByTimestamp<T extends { timestamp: number }, K>(
  streams: { key: K; iterator: AsyncIterator<T> }[],
): AsyncGenerator<{ key: K; item: T }> {
  const heads = await Promise.all(streams.map(async (s) => ({ ...s, head: await s.iterator.next() })))
  while (true) {
    let best: (typeof heads)[number] | null = null
    for (const h of heads) {
      if (h.head.done) continue
      if (!best || h.head.value.timestamp < (best.head.value as T).timestamp) best = h
    }
    if (!best || best.head.done) return
    yield { key: best.key, item: best.head.value }
    best.head = await best.iterator.next()
  }
}
