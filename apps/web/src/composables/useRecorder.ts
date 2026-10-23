import { onScopeDispose, ref } from 'vue'
import { openAppendWriter, type AppendWriter } from '../lib/opfs'
import { extensionFor, pickRecorderMimeType, probeDuration } from '../lib/media'
import { readFile } from '../lib/opfs'

export interface RecordedTake {
  id: string
  path: string
  mimeType: string
  duration: number
  size: number
}

/** Pedaços de 1 s: se a aba cair, perde-se no máximo o último segundo já gravado em disco. */
const TIMESLICE_MS = 1000

/** MediaRecorder gravando em pedaços direto no OPFS. */
export function useRecorder() {
  const recording = ref(false)
  const elapsed = ref(0)
  const error = ref<string | null>(null)

  let recorder: MediaRecorder | null = null
  let writer: AppendWriter | null = null
  let startedAt = 0
  let timer = 0
  let current: { id: string; path: string; mimeType: string } | null = null
  let stopped: Promise<void> | null = null

  async function start(stream: MediaStream): Promise<void> {
    const mimeType = pickRecorderMimeType()
    if (!mimeType) throw new Error('Gravação não suportada neste navegador')
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const path = `takes/${id}.${extensionFor(mimeType)}`
    writer = await openAppendWriter(path)
    current = { id, path, mimeType }
    error.value = null

    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 })
    const w = writer
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) w.append(e.data).catch((err) => (error.value = String(err)))
    }
    stopped = new Promise((resolve) => {
      recorder!.onstop = () => resolve()
    })
    recorder.start(TIMESLICE_MS)
    startedAt = performance.now()
    elapsed.value = 0
    recording.value = true
    timer = window.setInterval(() => (elapsed.value = (performance.now() - startedAt) / 1000), 100)
  }

  /** Para a gravação, fecha o arquivo e mede a duração real do take. */
  async function stop(): Promise<RecordedTake | null> {
    if (!recorder || !writer || !current) return null
    clearInterval(timer)
    if (recorder.state !== 'inactive') recorder.stop()
    await stopped
    recording.value = false
    await writer.close()
    const take = current
    const file = await readFile(take.path)
    recorder = null
    writer = null
    current = null
    if (!file || file.size === 0) throw new Error('A gravação ficou vazia')
    const duration = await probeDuration(file)
    return { ...take, duration, size: file.size }
  }

  /** Descarta a gravação em andamento (ex.: o usuário saiu da tela). */
  async function cancel() {
    clearInterval(timer)
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.stop()
    }
    recording.value = false
    await writer?.abort().catch(() => {})
    recorder = null
    writer = null
    current = null
  }

  onScopeDispose(() => {
    if (recording.value) void cancel()
  })

  return { recording, elapsed, error, start, stop, cancel }
}
