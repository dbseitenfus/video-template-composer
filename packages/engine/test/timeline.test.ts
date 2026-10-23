import { describe, expect, it } from 'vitest'
import { buildTimeline, frameTime, locate, MissingTakeError, missingSlots } from '../src'
import { makeTemplate } from './fixtures'

describe('buildTimeline', () => {
  it('encadeia abertura, slots e encerramento', () => {
    const tl = buildTimeline(makeTemplate(), { a: 4.2, b: 3 })
    expect(tl.segments.map((s) => [s.kind, s.start, s.duration])).toEqual([
      ['intro', 0, 2],
      ['slot', 2, 4.2],
      ['slot', 6.2, 3],
      ['outro', 9.2, 3],
    ])
    expect(tl.duration).toBeCloseTo(12.2)
    expect(tl.totalFrames).toBe(366)
  })

  it('corta o take em maxDuration e alinha em frames inteiros', () => {
    const tl = buildTimeline(makeTemplate(), { a: 4.01234, b: 9 })
    const [, a, b] = tl.segments
    expect(a!.duration * 30).toBeCloseTo(Math.round(4.01234 * 30))
    expect(b!.duration).toBe(5)
  })

  it('exige take para todos os slots', () => {
    expect(() => buildTimeline(makeTemplate(), { a: 3 })).toThrow(MissingTakeError)
    expect(missingSlots(makeTemplate(), { a: 3 })).toEqual(['b'])
  })
})

describe('locate', () => {
  const tl = buildTimeline(makeTemplate(), { a: 4, b: 3 })

  it('acha o segmento e o tempo local', () => {
    expect(locate(tl, 0)?.segment.kind).toBe('intro')
    const hit = locate(tl, 3)
    expect(hit?.segment.kind).toBe('slot')
    expect(hit?.local).toBeCloseTo(1)
  })

  it('troca de segmento exatamente no frame do corte', () => {
    expect(locate(tl, frameTime(60, 30))?.segment.index).toBe(1)
    expect(locate(tl, frameTime(59, 30))?.segment.index).toBe(0)
  })

  it('devolve null fora do vídeo', () => {
    expect(locate(tl, -1)).toBeNull()
    expect(locate(tl, 100)).toBeNull()
  })
})
