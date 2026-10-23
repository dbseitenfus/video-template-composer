import type { Template } from '@takeslot/schema'
import type { Segment, Timeline } from './timeline'

export interface GainKeyframe {
  time: number
  gain: number
}

/**
 * Curva de volume da trilha: fade-in, ducking durante as falas (e clipes com `duckMusic`) e fade-out.
 * As rampas são lineares entre keyframes. O mix offline e o preview usam a mesma curva.
 */
export function musicGainKeyframes(template: Template, timeline: Timeline): GainKeyframe[] {
  const music = template.music
  if (!music || timeline.duration <= 0) return []
  const total = timeline.duration
  const ramp = music.duckRamp
  // A trilha abaixa nas falas e nos clipes com `duckMusic`.
  const level = (seg: Segment | undefined) =>
    seg?.kind === 'slot' || (seg?.kind === 'clip' && seg.clip.duckMusic) ? music.duckedVolume : music.volume

  const points: GainKeyframe[] = []
  const first = timeline.segments[0]
  points.push({ time: 0, gain: music.fadeIn > 0 ? 0 : level(first) })

  for (let i = 0; i < timeline.segments.length; i++) {
    const seg = timeline.segments[i]!
    const prev = timeline.segments[i - 1]
    const target = level(seg)
    if (i === 0) {
      points.push({ time: Math.min(music.fadeIn, seg.duration), gain: target })
      continue
    }
    if (prev && level(prev) !== target) {
      // Desce a trilha um pouco antes da fala começar e sobe logo depois que ela termina.
      const ducking = target < level(prev)
      const from = ducking ? seg.start - ramp : seg.start
      const to = ducking ? seg.start : seg.start + ramp
      points.push({ time: Math.max(0, from), gain: level(prev) })
      points.push({ time: Math.min(total, to), gain: target })
    }
  }

  const last = timeline.segments[timeline.segments.length - 1]!
  if (music.fadeOut > 0) {
    const fadeStart = Math.max(0, total - music.fadeOut)
    const atFade = gainAt(normalizeKeyframes(points), fadeStart, level(last))
    const before = points.filter((p) => p.time < fadeStart)
    points.length = 0
    points.push(...before, { time: fadeStart, gain: atFade }, { time: total, gain: 0 })
  } else {
    points.push({ time: total, gain: level(last) })
  }
  return normalizeKeyframes(points)
}

/** Ordena e remove keyframes redundantes no mesmo instante (fica o último). */
function normalizeKeyframes(points: GainKeyframe[]): GainKeyframe[] {
  const sorted = points.map((p, i) => ({ ...p, i })).sort((a, b) => a.time - b.time || a.i - b.i)
  const out: GainKeyframe[] = []
  for (const { time, gain } of sorted) {
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev.time - time) < 1e-6) prev.gain = gain
    else out.push({ time, gain })
  }
  return out
}

/** Interpola a curva no instante `t`. */
export function gainAt(points: GainKeyframe[], t: number, fallback = 1): number {
  if (points.length === 0) return fallback
  const first = points[0]!
  if (t <= first.time) return first.gain
  for (let i = 1; i < points.length; i++) {
    const b = points[i]!
    if (t <= b.time) {
      const a = points[i - 1]!
      const span = b.time - a.time
      return span <= 0 ? b.gain : a.gain + ((b.gain - a.gain) * (t - a.time)) / span
    }
  }
  return points[points.length - 1]!.gain
}

export interface LevelStats {
  rmsDb: number
  peak: number
}

/** RMS (em dBFS) e pico de um conjunto de canais. */
export function measureLevel(channels: Float32Array[]): LevelStats {
  let sum = 0
  let count = 0
  let peak = 0
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!
      sum += v * v
      const a = Math.abs(v)
      if (a > peak) peak = a
    }
    count += data.length
  }
  const rms = count > 0 ? Math.sqrt(sum / count) : 0
  return { rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity, peak }
}

/**
 * Ganho linear para levar a fala ao RMS alvo, limitado por `maxGainDb`
 * e pelo pico (para não clipar antes do compressor final).
 */
export function normalizationGain(stats: LevelStats, targetRmsDb: number, maxGainDb: number): number {
  if (!Number.isFinite(stats.rmsDb) || stats.peak === 0) return 1
  const wantedDb = Math.max(-maxGainDb, Math.min(maxGainDb, targetRmsDb - stats.rmsDb))
  const peakLimit = 0.99 / stats.peak
  return Math.min(Math.pow(10, wantedDb / 20), Math.max(peakLimit, Math.pow(10, -maxGainDb / 20)))
}

/** Fades curtos nas bordas de cada fala para evitar estalos nos cortes (segundos). */
export const VOICE_EDGE_FADE = 0.03
