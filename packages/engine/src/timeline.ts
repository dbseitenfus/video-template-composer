import type { Background, Layer, Slot, Template } from '@takeslot/schema'

export type SegmentKind = 'intro' | 'slot' | 'outro'

interface BaseSegment {
  index: number
  kind: SegmentKind
  /** Início absoluto no vídeo final, em segundos. */
  start: number
  duration: number
  layers: Layer[]
}

export interface CardSegment extends BaseSegment {
  kind: 'intro' | 'outro'
  background: Background
}

export interface SlotSegment extends BaseSegment {
  kind: 'slot'
  slot: Slot
}

export type Segment = CardSegment | SlotSegment

export interface Timeline {
  fps: number
  duration: number
  totalFrames: number
  segments: Segment[]
}

/** Duração de cada take gravado, por id do slot, em segundos. */
export type TakeDurations = Record<string, number>

export class MissingTakeError extends Error {
  constructor(public readonly slotId: string) {
    super(`Falta o take do slot "${slotId}"`)
    this.name = 'MissingTakeError'
  }
}

/**
 * Monta a linha do tempo: abertura, um segmento por slot e encerramento.
 * Os takes são cortados em `maxDuration`; os limites caem em frames inteiros
 * para que preview e exportação concordem no frame de cada troca.
 */
export function buildTimeline(template: Template, takes: TakeDurations): Timeline {
  const fps = template.fps
  const snap = (s: number) => Math.max(1, Math.round(s * fps)) / fps
  const segments: Segment[] = []
  let cursor = 0

  const push = (segment: Omit<CardSegment, 'index' | 'start'> | Omit<SlotSegment, 'index' | 'start'>) => {
    const duration = snap(segment.duration)
    segments.push({ ...segment, index: segments.length, start: cursor, duration } as Segment)
    cursor = Math.round((cursor + duration) * fps) / fps
  }

  if (template.intro) {
    push({ kind: 'intro', duration: template.intro.duration, layers: template.intro.layers, background: template.intro.background })
  }
  for (const slot of template.slots) {
    const take = takes[slot.id]
    if (take === undefined || !(take > 0)) throw new MissingTakeError(slot.id)
    push({ kind: 'slot', duration: Math.min(take, slot.maxDuration), layers: slot.layers, slot })
  }
  if (template.outro) {
    push({ kind: 'outro', duration: template.outro.duration, layers: template.outro.layers, background: template.outro.background })
  }

  return { fps, duration: cursor, totalFrames: Math.round(cursor * fps), segments }
}

/** Instante do frame `n`. A amostragem é sempre por timestamp, nunca por contagem de frames da fonte. */
export function frameTime(n: number, fps: number): number {
  return n / fps
}

export interface Located {
  segment: Segment
  /** Tempo dentro do segmento, em segundos. */
  local: number
}

/** Encontra o segmento ativo no instante `t` (busca binária). */
export function locate(timeline: Timeline, t: number): Located | null {
  const { segments } = timeline
  if (segments.length === 0 || t < 0) return null
  // Tolerância de meio frame evita cair no segmento anterior por erro de ponto flutuante.
  const eps = 0.5 / timeline.fps
  let lo = 0
  let hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segments[mid]!.start <= t + eps) lo = mid
    else hi = mid - 1
  }
  const segment = segments[lo]!
  const local = Math.max(0, t - segment.start)
  if (local > segment.duration + eps) return null
  return { segment, local: Math.min(local, segment.duration) }
}

/** Ids dos slots ainda sem take. */
export function missingSlots(template: Template, takes: TakeDurations): string[] {
  return template.slots.filter((s) => !(takes[s.id]! > 0)).map((s) => s.id)
}
