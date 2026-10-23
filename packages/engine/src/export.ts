import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  getFirstEncodableAudioCodec,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  VideoSampleSink,
  type AudioCodec,
  type StreamTargetChunk,
  type VideoSample,
} from 'mediabunny'
import { outputSize, type Resolution, type Template } from '@takeslot/schema'
import type { MixedAudio } from './audio-mix'
import { renderFrame, type Ctx2D, type FrameSource, type RenderSources, type Rotation } from './render'
import { TimestampSampler } from './sampler'
import { mergeByTimestamp, planChunks, type ExportChunk } from './segments'
import { buildTimeline, frameTime, locate, type TakeDurations, type Timeline } from './timeline'

/*
 * Pipeline de exportação: decode → renderFrame → encode → mux.
 * Roda dentro de um Worker com OffscreenCanvas. Cada pedaço de ~10 s vira um MP4
 * no armazenamento (checkpoint); no fim os pedaços são unidos sem recodificar.
 */

/** Armazenamento de arquivos usado pela exportação (OPFS no app, memória no benchmark). */
export interface ExportStorage {
  read(path: string): Promise<Blob | null>
  write(path: string, data: Uint8Array): Promise<void>
  /** Escrita com posição (o muxer volta para corrigir cabeçalhos). */
  openWritable(path: string): Promise<WritableStream<StreamTargetChunk>>
  remove(path: string): Promise<void>
}

export interface ExportJob {
  /** Id estável do trabalho; reaproveitado na retomada. */
  id: string
  template: Template
  takeDurations: TakeDurations
  /** Caminho do arquivo de cada take no armazenamento, por id do slot. */
  takePaths: Record<string, string>
  resolution: Resolution
  /** Imagens do template já rasterizadas na thread principal. */
  images: Record<string, ImageBitmap>
  /** PCM mixado na thread principal; `null` gera vídeo sem áudio. */
  audio: MixedAudio | null
  chunkSeconds?: number
  videoBitrate?: number
}

export type ExportPhase = 'video' | 'audio' | 'mux' | 'done'

export interface ExportProgress {
  phase: ExportPhase
  framesDone: number
  totalFrames: number
  chunksDone: number
  totalChunks: number
  /** 0–1, considerando vídeo como ~90% do trabalho. */
  fraction: number
  /** Segundos de vídeo por segundo de processamento. */
  speed: number
  etaSeconds: number | null
}

export interface ExportResult {
  path: string
  mimeType: string
  size: number
  duration: number
  width: number
  height: number
  audioCodec: AudioCodec | null
  /** Pedaços reaproveitados de uma execução anterior. */
  resumedChunks: number
  elapsedSeconds: number
}

export interface BenchmarkResult {
  resolution: Resolution
  seconds: number
  elapsedSeconds: number
  speed: number
  /** Estimativa para o vídeo inteiro, em segundos. */
  estimatedTotalSeconds: number
}

export class ExportAbortedError extends Error {
  constructor() {
    super('Exportação cancelada')
    this.name = 'AbortError'
  }
}

export class ChunkMismatchError extends Error {
  constructor(index: number) {
    super(`O pedaço ${index} foi codificado com uma configuração diferente e não pode ser unido sem recodificar`)
    this.name = 'ChunkMismatchError'
  }
}

const MAX_ENCODE_QUEUE = 8
const KEYFRAME_INTERVAL_SECONDS = 2

export const exportPaths = (jobId: string) => ({
  dir: `exports/${jobId}`,
  manifest: `exports/${jobId}/manifest.json`,
  chunk: (i: number) => `exports/${jobId}/chunk-${String(i).padStart(4, '0')}.mp4`,
  audio: `exports/${jobId}/audio.mp4`,
  final: `exports/${jobId}/final.mp4`,
})

interface Manifest {
  fingerprint: string
  chunks: number[]
  audio: boolean
}

export function defaultBitrate(width: number, height: number, fps: number): number {
  const pixels = width * height
  const base = pixels >= 1920 * 1080 * 0.9 ? 8_000_000 : 5_000_000
  return Math.round(base * (fps / 30))
}

/** Escolhe um perfil H.264 suportado, preferindo aceleração por hardware. */
export async function chooseVideoConfig(width: number, height: number, fps: number, bitrate: number): Promise<VideoEncoderConfig> {
  const codecs = ['avc1.640028', 'avc1.4d0028', 'avc1.640033', 'avc1.42e028', 'avc1.42e01f']
  for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
    for (const codec of codecs) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration,
        latencyMode: 'quality',
        avc: { format: 'avc' },
      }
      try {
        const support = await VideoEncoder.isConfigSupported(config)
        if (support.supported) return support.config ?? config
      } catch {
        // Alguns navegadores lançam em vez de devolver supported=false.
      }
    }
  }
  throw new Error(`Este aparelho não codifica H.264 em ${width}×${height}`)
}

/** Lê os frames dos takes, mantendo um único take aberto por vez. */
class TakeReader {
  private open: { slotId: string; input: Input; sampler: TimestampSampler<VideoSample>; rotation: Rotation } | null = null

  constructor(
    private readonly storage: ExportStorage,
    private readonly paths: Record<string, string>,
  ) {}

  async frameAt(slotId: string, local: number): Promise<{ sample: VideoSample; rotation: Rotation } | null> {
    if (this.open?.slotId !== slotId) {
      this.close()
      const path = this.paths[slotId]
      const blob = path ? await this.storage.read(path) : null
      if (!blob) throw new Error(`Take do slot "${slotId}" não encontrado`)
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
      const track = await input.getPrimaryVideoTrack()
      if (!track) throw new Error(`O take do slot "${slotId}" não tem vídeo`)
      const base = await track.getFirstTimestamp()
      const sink = new VideoSampleSink(track)
      const sampler = new TimestampSampler(sink.samples(base + local)[Symbol.asyncIterator](), base)
      this.open = { slotId, input, sampler, rotation: track.rotation }
    }
    const sample = await this.open.sampler.at(local)
    return sample ? { sample, rotation: this.open.rotation } : null
  }

  close() {
    if (!this.open) return
    this.open.sampler.close()
    this.open.input.dispose()
    this.open = null
  }
}

interface RenderContext {
  template: Template
  timeline: Timeline
  ctx: OffscreenCanvasRenderingContext2D
  canvas: OffscreenCanvas
  images: RenderSources['images']
  reader: TakeReader
}

async function drawFrameAt(rc: RenderContext, n: number): Promise<void> {
  const t = frameTime(n, rc.timeline.fps)
  const located = locate(rc.timeline, t)
  let frame: FrameSource | null = null
  let sample: VideoSample | null = null
  if (located?.segment.kind === 'slot') {
    const hit = await rc.reader.frameAt(located.segment.slot.id, located.local)
    if (hit) {
      sample = hit.sample
      // `toCanvasImageSource` precisa ser usado na mesma tarefa: nada de await até o desenho.
      frame = { image: sample.toCanvasImageSource(), width: sample.squarePixelWidth, height: sample.squarePixelHeight, rotation: hit.rotation }
    }
  }
  renderFrame(rc.ctx as Ctx2D, rc.template, t, { timeline: rc.timeline, frame, images: rc.images })
}

function createRenderContext(job: ExportJob, storage: ExportStorage) {
  const template = job.template
  const timeline = buildTimeline(template, job.takeDurations)
  const { width, height } = outputSize(template, job.resolution)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('OffscreenCanvas 2D indisponível')
  const images: RenderSources['images'] = {}
  for (const [name, bitmap] of Object.entries(job.images)) images[name] = { image: bitmap, width: bitmap.width, height: bitmap.height }
  const rc: RenderContext = { template, timeline, ctx, canvas, images, reader: new TakeReader(storage, job.takePaths) }
  return { rc, width, height }
}

function waitForDequeue(encoder: VideoEncoder): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, 20)
    function done() {
      clearTimeout(timer)
      encoder.removeEventListener('dequeue', done)
      resolve()
    }
    encoder.addEventListener('dequeue', done)
  })
}

/**
 * Codifica os frames [startFrame, endFrame) com um VideoEncoder próprio,
 * controlando a fila (`encodeQueueSize`) para não acumular VideoFrames na memória.
 */
async function encodeFrames(
  rc: RenderContext,
  config: VideoEncoderConfig,
  startFrame: number,
  endFrame: number,
  onChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void,
  onFrame: (n: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const fps = rc.timeline.fps
  let failure: unknown = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => onChunk(chunk, meta),
    error: (e) => (failure = e),
  })
  encoder.configure(config)
  const keyEvery = Math.round(KEYFRAME_INTERVAL_SECONDS * fps)
  const frameDuration = Math.round(1e6 / fps)
  try {
    for (let n = startFrame; n < endFrame; n++) {
      if (signal?.aborted) throw new ExportAbortedError()
      if (failure) throw failure
      await drawFrameAt(rc, n)
      const frame = new VideoFrame(rc.canvas, { timestamp: Math.round(((n - startFrame) * 1e6) / fps), duration: frameDuration })
      while (encoder.encodeQueueSize >= MAX_ENCODE_QUEUE) await waitForDequeue(encoder)
      encoder.encode(frame, { keyFrame: (n - startFrame) % keyEvery === 0 })
      frame.close()
      onFrame(n)
    }
    await encoder.flush()
    if (failure) throw failure
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
}

async function encodeChunk(
  rc: RenderContext,
  config: VideoEncoderConfig,
  chunk: ExportChunk,
  onFrame: (n: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
  const source = new EncodedVideoPacketSource('avc')
  output.addVideoTrack(source, { frameRate: rc.timeline.fps })
  await output.start()
  let queue = Promise.resolve()
  try {
    await encodeFrames(
      rc,
      config,
      chunk.startFrame,
      chunk.endFrame,
      (encoded, meta) => {
        const packet = EncodedPacket.fromEncodedChunk(encoded)
        queue = queue.then(() => source.add(packet, meta))
      },
      onFrame,
      signal,
    )
    await queue
    await output.finalize()
  } catch (e) {
    await output.cancel().catch(() => {})
    throw e
  }
  return new Uint8Array(output.target.buffer!)
}

async function encodeAudio(audio: MixedAudio): Promise<{ data: Uint8Array; codec: AudioCodec }> {
  const numberOfChannels = audio.channels.length
  const codec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels, sampleRate: audio.sampleRate })
  if (!codec) throw new Error('Este navegador não codifica AAC nem Opus')
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
  const source = new AudioSampleSource({ codec, bitrate: codec === 'aac' ? 160_000 : 128_000 })
  output.addAudioTrack(source)
  await output.start()

  const length = audio.channels[0]?.length ?? 0
  const block = audio.sampleRate // 1 s por amostra
  for (let offset = 0; offset < length; offset += block) {
    const frames = Math.min(block, length - offset)
    const data = new Float32Array(frames * numberOfChannels)
    audio.channels.forEach((ch, c) => data.set(ch.subarray(offset, offset + frames), c * frames))
    const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels, sampleRate: audio.sampleRate, timestamp: offset / audio.sampleRate })
    await source.add(sample)
    sample.close()
  }
  await output.finalize()
  return { data: new Uint8Array(output.target.buffer!), codec }
}

async function* trackPackets(storage: ExportStorage, path: string, kind: 'video' | 'audio', offset: number, onConfig: (c: VideoDecoderConfig | AudioDecoderConfig) => void) {
  const blob = await storage.read(path)
  if (!blob) throw new Error(`Arquivo ausente: ${path}`)
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  try {
    const track = kind === 'video' ? await input.getPrimaryVideoTrack() : await input.getPrimaryAudioTrack()
    if (!track) throw new Error(`Faixa de ${kind} ausente em ${path}`)
    const config = await track.getDecoderConfig()
    if (config) onConfig(config)
    for await (const packet of new EncodedPacketSink(track).packets()) {
      yield offset === 0 ? packet : packet.clone({ timestamp: packet.timestamp + offset })
    }
  } finally {
    input.dispose()
  }
}

function sameDescription(a?: AllowSharedBufferSource, b?: AllowSharedBufferSource): boolean {
  if (!a || !b) return a === b
  // Sem `instanceof SharedArrayBuffer`: ele não existe em páginas sem isolamento cross-origin.
  const bytes = (v: AllowSharedBufferSource) => (ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : new Uint8Array(v))
  const x = bytes(a)
  const y = bytes(b)
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** Une os pedaços de vídeo e o áudio num MP4 final, copiando os pacotes sem recodificar. */
async function concatenate(
  storage: ExportStorage,
  job: ExportJob,
  chunks: ExportChunk[],
  fps: number,
  audioCodec: AudioCodec | null,
): Promise<void> {
  const paths = exportPaths(job.id)
  const writable = await storage.openWritable(paths.final)
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new StreamTarget(writable, { chunked: true }) })
  const videoSource = new EncodedVideoPacketSource('avc')
  output.addVideoTrack(videoSource, { frameRate: fps })
  const audioSource = audioCodec ? new EncodedAudioPacketSource(audioCodec) : null
  if (audioSource) output.addAudioTrack(audioSource)
  await output.start()

  let videoConfig: VideoDecoderConfig | null = null
  let audioConfig: AudioDecoderConfig | null = null
  async function* video() {
    for (const chunk of chunks) {
      yield* trackPackets(storage, paths.chunk(chunk.index), 'video', chunk.startFrame / fps, (c) => {
        const config = c as VideoDecoderConfig
        if (!videoConfig) videoConfig = config
        else if (!sameDescription(videoConfig.description, config.description)) throw new ChunkMismatchError(chunk.index)
      })
    }
  }
  const streams: { key: 'video' | 'audio'; iterator: AsyncIterator<EncodedPacket> }[] = [{ key: 'video', iterator: video() }]
  if (audioSource) {
    streams.push({ key: 'audio', iterator: trackPackets(storage, paths.audio, 'audio', 0, (c) => (audioConfig = c as AudioDecoderConfig)) })
  }

  let firstVideo = true
  let firstAudio = true
  try {
    for await (const { key, item } of mergeByTimestamp(streams)) {
      if (key === 'video') {
        await videoSource.add(item, firstVideo && videoConfig ? { decoderConfig: videoConfig } : undefined)
        firstVideo = false
      } else if (audioSource) {
        await audioSource.add(item, firstAudio && audioConfig ? { decoderConfig: audioConfig } : undefined)
        firstAudio = false
      }
    }
    await output.finalize()
  } catch (e) {
    await output.cancel().catch(() => {})
    throw e
  }
}

function fingerprint(job: ExportJob, chunks: ExportChunk[]): string {
  return JSON.stringify({
    template: job.template.id,
    resolution: job.resolution,
    takes: job.takePaths,
    durations: job.takeDurations,
    chunks: chunks.map((c) => [c.startFrame, c.endFrame]),
    audio: job.audio ? job.audio.channels[0]?.length : 0,
  })
}

async function readManifest(storage: ExportStorage, path: string): Promise<Manifest | null> {
  const blob = await storage.read(path)
  if (!blob) return null
  try {
    return JSON.parse(await blob.text()) as Manifest
  } catch {
    return null
  }
}

/**
 * Exporta o vídeo. Pedaços já prontos de uma execução anterior com o mesmo
 * `job.id` são reaproveitados — é assim que a exportação retoma depois que
 * o iOS descarta a aba.
 */
export async function runExport(
  job: ExportJob,
  storage: ExportStorage,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const started = performance.now()
  const { rc, width, height } = createRenderContext(job, storage)
  const { timeline } = rc
  const fps = timeline.fps
  const chunks = planChunks(timeline.totalFrames, fps, job.chunkSeconds ?? 10)
  const paths = exportPaths(job.id)
  const print = fingerprint(job, chunks)

  let manifest = await readManifest(storage, paths.manifest)
  if (!manifest || manifest.fingerprint !== print) manifest = { fingerprint: print, chunks: [], audio: false }
  const saveManifest = () => storage.write(paths.manifest, new TextEncoder().encode(JSON.stringify(manifest)))
  const resumedChunks = manifest.chunks.length

  const bitrate = job.videoBitrate ?? defaultBitrate(width, height, fps)
  const config = await chooseVideoConfig(width, height, fps, bitrate)

  const doneFrames = () => chunks.filter((c) => manifest!.chunks.includes(c.index)).reduce((s, c) => s + c.endFrame - c.startFrame, 0)
  let framesDone = doneFrames()
  let renderedThisRun = 0
  const report = (phase: ExportPhase) => {
    const elapsed = (performance.now() - started) / 1000
    const speed = elapsed > 0 ? renderedThisRun / fps / elapsed : 0
    const remaining = (timeline.totalFrames - framesDone) / fps
    const videoFraction = timeline.totalFrames > 0 ? framesDone / timeline.totalFrames : 1
    const fraction = phase === 'done' ? 1 : phase === 'video' ? videoFraction * 0.9 : phase === 'audio' ? 0.92 : 0.95
    onProgress?.({
      phase,
      framesDone,
      totalFrames: timeline.totalFrames,
      chunksDone: manifest!.chunks.length,
      totalChunks: chunks.length,
      fraction,
      speed,
      etaSeconds: speed > 0 ? remaining / speed : null,
    })
  }
  report('video')

  try {
    for (const chunk of chunks) {
      if (manifest.chunks.includes(chunk.index)) continue
      const data = await encodeChunk(
        rc,
        config,
        chunk,
        () => {
          framesDone++
          renderedThisRun++
          if (renderedThisRun % 5 === 0) report('video')
        },
        signal,
      )
      await storage.write(paths.chunk(chunk.index), data)
      manifest.chunks.push(chunk.index)
      await saveManifest()
      report('video')
    }
  } finally {
    rc.reader.close()
  }

  let audioCodec: AudioCodec | null = null
  if (job.audio) {
    if (signal?.aborted) throw new ExportAbortedError()
    report('audio')
    const existing = manifest.audio ? await storage.read(paths.audio) : null
    if (existing) {
      const input = new Input({ source: new BlobSource(existing), formats: ALL_FORMATS })
      audioCodec = ((await input.getPrimaryAudioTrack())?.codec as AudioCodec | null) ?? null
      input.dispose()
    }
    if (!audioCodec) {
      const encoded = await encodeAudio(job.audio)
      await storage.write(paths.audio, encoded.data)
      audioCodec = encoded.codec
      manifest.audio = true
      await saveManifest()
    }
  }

  if (signal?.aborted) throw new ExportAbortedError()
  report('mux')
  await concatenate(storage, job, chunks, fps, audioCodec)
  const final = await storage.read(paths.final)
  report('done')

  return {
    path: paths.final,
    mimeType: 'video/mp4',
    size: final?.size ?? 0,
    duration: timeline.duration,
    width,
    height,
    audioCodec,
    resumedChunks,
    elapsedSeconds: (performance.now() - started) / 1000,
  }
}

/**
 * Renderiza e codifica os primeiros `seconds` segundos sem gravar nada,
 * para estimar a velocidade do aparelho antes da exportação real.
 */
export async function benchmark(job: ExportJob, storage: ExportStorage, seconds = 2): Promise<BenchmarkResult> {
  const { rc, width, height } = createRenderContext(job, storage)
  const fps = rc.timeline.fps
  const frames = Math.min(rc.timeline.totalFrames, Math.max(1, Math.round(seconds * fps)))
  const config = await chooseVideoConfig(width, height, fps, job.videoBitrate ?? defaultBitrate(width, height, fps))
  // Começa no primeiro slot: é o caso caro (decode + composição), a abertura só desenha cartões.
  const firstSlot = rc.timeline.segments.find((s) => s.kind === 'slot')
  const start = firstSlot ? Math.min(Math.round(firstSlot.start * fps), rc.timeline.totalFrames - frames) : 0
  const t0 = performance.now()
  try {
    await encodeFrames(rc, config, start, start + frames, () => {}, () => {})
  } finally {
    rc.reader.close()
  }
  const elapsedSeconds = Math.max(1e-3, (performance.now() - t0) / 1000)
  const speed = frames / fps / elapsedSeconds
  return { resolution: job.resolution, seconds: frames / fps, elapsedSeconds, speed, estimatedTotalSeconds: rc.timeline.duration / speed }
}

/** Decide a resolução a partir do benchmark: cai para 720p se 1080p ficar lento demais. */
export function pickResolution(result: BenchmarkResult, allowed: Resolution[], minSpeed = 0.5): Resolution {
  if (result.resolution === 1080 && result.speed < minSpeed && allowed.includes(720)) return 720
  return result.resolution
}
