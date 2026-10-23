import * as Comlink from 'comlink'
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  Mp4OutputFormat,
  Output,
} from 'mediabunny'
import { MemoryStorage, runExport, type ExportJob, type ExportProgress, type ExportResult } from '@takeslot/engine'

/** Takes e arquivos de exportação ficam em memória: o benchmark não toca o OPFS do app. */
const storage = new MemoryStorage()

/** Gera um take sintético parecido com câmera: movimento, ruído e fala (tom modulado). */
async function generateTake(path: string, seconds: number, width: number, height: number): Promise<void> {
  const fps = 30
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
  const video = new CanvasSource(canvas, { codec: 'avc', bitrate: 6_000_000 })
  output.addVideoTrack(video, { frameRate: fps })
  const codec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 1, sampleRate: 48000 })
  const audio = codec ? new AudioSampleSource({ codec, bitrate: 96_000 }) : null
  if (audio) output.addAudioTrack(audio)
  await output.start()

  const frames = Math.round(seconds * fps)
  for (let n = 0; n < frames; n++) {
    const t = n / fps
    const g = ctx.createLinearGradient(0, 0, width, height)
    g.addColorStop(0, `hsl(${(t * 40) % 360} 60% 45%)`)
    g.addColorStop(1, `hsl(${(t * 40 + 120) % 360} 60% 30%)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`
      ctx.fillRect(Math.random() * width, Math.random() * height, width / 20, height / 20)
    }
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(width / 2 + Math.sin(t * 2) * width * 0.25, height / 2, Math.min(width, height) * 0.12, 0, Math.PI * 2)
    ctx.fill()
    await video.add(t, 1 / fps)
  }
  if (audio) {
    const sr = 48000
    for (let s = 0; s < seconds; s++) {
      const data = Float32Array.from({ length: sr }, (_, i) => {
        const tt = s + i / sr
        return 0.2 * Math.sin(2 * Math.PI * 180 * tt) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * tt))
      })
      const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: 1, sampleRate: sr, timestamp: s })
      await audio.add(sample)
      sample.close()
    }
  }
  await output.finalize()
  await storage.write(path, new Uint8Array(output.target.buffer!))
}

const api = {
  async generateTakes(specs: { path: string; seconds: number }[], width: number, height: number): Promise<void> {
    for (const spec of specs) if (!storage.files.has(spec.path)) await generateTake(spec.path, spec.seconds, width, height)
  },

  files(): string[] {
    return [...storage.files.keys()]
  },

  async readFile(path: string): Promise<Uint8Array | null> {
    return storage.files.get(path)?.slice() ?? null
  },

  async run(job: ExportJob, onProgress: (p: ExportProgress) => void): Promise<ExportResult> {
    // Cada execução começa do zero (sem retomar pedaços da anterior).
    await storage.remove(`exports/${job.id}`)
    const result = await runExport(job, storage, onProgress)
    await storage.remove(`exports/${job.id}`)
    return result
  },
}

export type BenchWorkerApi = typeof api

Comlink.expose(api)
