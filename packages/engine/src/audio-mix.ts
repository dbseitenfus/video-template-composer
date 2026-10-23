import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'
import type { Template } from '@takeslot/schema'
import { measureLevel, musicGainKeyframes, normalizationGain, VOICE_EDGE_FADE } from './audio-plan'
import type { Timeline } from './timeline'

/*
 * Mixagem em OfflineAudioContext. A Web Audio API só existe na thread principal,
 * então esta etapa roda fora do Worker e entrega PCM pronto para ser codificado.
 */

export interface MixedAudio {
  sampleRate: number
  /** Um Float32Array por canal (planar). */
  channels: Float32Array[]
}

/**
 * Decodifica o áudio de um take para um único AudioBuffer.
 * O tempo zero é o primeiro frame de vídeo, o mesmo usado pelo amostrador de vídeo,
 * para que fala e imagem fiquem alinhadas.
 */
export async function decodeTakeAudio(blob: Blob): Promise<AudioBuffer | null> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  try {
    const audioTrack = await input.getPrimaryAudioTrack()
    if (!audioTrack || !(await audioTrack.canDecode())) return null
    const videoTrack = await input.getPrimaryVideoTrack()
    const base = videoTrack ? await videoTrack.getFirstTimestamp() : await audioTrack.getFirstTimestamp()

    const chunks: { buffer: AudioBuffer; timestamp: number }[] = []
    for await (const { buffer, timestamp } of new AudioBufferSink(audioTrack).buffers()) {
      chunks.push({ buffer, timestamp: timestamp - base })
    }
    if (chunks.length === 0) return null

    const first = chunks[0]!.buffer
    const sampleRate = first.sampleRate
    const numberOfChannels = first.numberOfChannels
    const last = chunks[chunks.length - 1]!
    const length = Math.ceil((last.timestamp + last.buffer.duration) * sampleRate)
    if (length <= 0) return null

    const out = new AudioBuffer({ length, numberOfChannels, sampleRate })
    for (const { buffer, timestamp } of chunks) {
      let offset = Math.round(timestamp * sampleRate)
      let skip = 0
      if (offset < 0) {
        skip = -offset
        offset = 0
      }
      for (let c = 0; c < numberOfChannels; c++) {
        const data = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1))
        const slice = skip > 0 ? data.subarray(skip) : data
        const room = length - offset
        if (room <= 0) break
        out.copyToChannel(slice.length > room ? slice.subarray(0, room) : slice, c, offset)
      }
    }
    return out
  } finally {
    input.dispose()
  }
}

/** Baixa e decodifica um arquivo de áudio (a trilha do template). */
export async function decodeAudioUrl(url: string): Promise<AudioBuffer> {
  const data = await (await fetch(url)).arrayBuffer()
  const ctx = new OfflineAudioContext(1, 1, 48000)
  return ctx.decodeAudioData(data)
}

export interface MixInput {
  template: Template
  timeline: Timeline
  /** Áudio decodificado de cada take, por id do slot. */
  takes: Record<string, AudioBuffer | null | undefined>
  /** Áudio decodificado de cada clipe fixo, por id do clipe. */
  clips?: Record<string, AudioBuffer | null | undefined>
  music?: AudioBuffer | null
  sampleRate?: number
  numberOfChannels?: number
}

/** Ganho de normalização de cada take, por id do slot. */
export function takeGains(template: Template, takes: MixInput['takes']): Record<string, number> {
  const gains: Record<string, number> = {}
  for (const [slotId, buffer] of Object.entries(takes)) {
    if (!buffer) continue
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
    gains[slotId] = normalizationGain(measureLevel(channels), template.audio.targetRmsDb, template.audio.maxGainDb)
  }
  return gains
}

/**
 * Mixa falas, clipes e trilha pelo tempo absoluto da linha do tempo:
 * cada fala ou clipe entra no início do seu segmento e é cortado no fim dele.
 */
export async function mixAudio(input: MixInput): Promise<MixedAudio> {
  const { template, timeline } = input
  const sampleRate = input.sampleRate ?? 48000
  const numberOfChannels = input.numberOfChannels ?? 2
  const length = Math.max(1, Math.ceil(timeline.duration * sampleRate))
  const ctx = new OfflineAudioContext({ numberOfChannels, length, sampleRate })

  // Compressor/limitador no master para segurar picos da soma fala + trilha.
  const master = ctx.createDynamicsCompressor()
  master.threshold.value = -3
  master.knee.value = 3
  master.ratio.value = 20
  master.attack.value = 0.003
  master.release.value = 0.15
  master.connect(ctx.destination)

  const gains = takeGains(template, input.takes)
  for (const segment of timeline.segments) {
    if (segment.kind !== 'slot') continue
    const buffer = input.takes[segment.slot.id]
    if (!buffer) continue
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const gain = ctx.createGain()
    const level = gains[segment.slot.id] ?? 1
    const start = segment.start
    const end = segment.start + segment.duration
    const fade = Math.min(VOICE_EDGE_FADE, segment.duration / 4)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(level, start + fade)
    gain.gain.setValueAtTime(level, end - fade)
    gain.gain.linearRampToValueAtTime(0, end)
    src.connect(gain).connect(master)
    src.start(start, 0, segment.duration)
  }

  // Clipes fixos: tocam no volume definido no template, sem normalização (já vêm masterizados).
  for (const segment of timeline.segments) {
    if (segment.kind !== 'clip' || segment.clip.volume <= 0) continue
    const buffer = input.clips?.[segment.clip.id]
    if (!buffer) continue
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const gain = ctx.createGain()
    const level = segment.clip.volume
    const start = segment.start
    const end = segment.start + segment.duration
    const fade = Math.min(VOICE_EDGE_FADE, segment.duration / 4)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(level, start + fade)
    gain.gain.setValueAtTime(level, end - fade)
    gain.gain.linearRampToValueAtTime(0, end)
    src.connect(gain).connect(master)
    src.start(start, segment.clip.trimStart, segment.duration)
  }

  if (template.music && input.music) {
    const src = ctx.createBufferSource()
    src.buffer = input.music
    src.loop = template.music.loop
    const gain = ctx.createGain()
    const keyframes = musicGainKeyframes(template, timeline)
    gain.gain.setValueAtTime(keyframes[0]?.gain ?? template.music.volume, 0)
    for (const k of keyframes.slice(1)) gain.gain.linearRampToValueAtTime(k.gain, k.time)
    src.connect(gain).connect(master)
    src.start(0)
  }

  const rendered = await ctx.startRendering()
  return {
    sampleRate,
    channels: Array.from({ length: numberOfChannels }, (_, c) => rendered.getChannelData(c).slice()),
  }
}
