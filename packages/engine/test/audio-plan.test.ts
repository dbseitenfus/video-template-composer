import { describe, expect, it } from 'vitest'
import { buildTimeline, gainAt, measureLevel, musicGainKeyframes, normalizationGain } from '../src'
import { makeTemplate } from './fixtures'

describe('musicGainKeyframes', () => {
  const template = makeTemplate()
  const tl = buildTimeline(template, { a: 4, b: 3 }) // intro 0–2, a 2–6, b 6–9, outro 9–12
  const k = musicGainKeyframes(template, tl)

  it('começa e termina em silêncio por causa dos fades', () => {
    expect(gainAt(k, 0)).toBe(0)
    expect(gainAt(k, 12)).toBe(0)
  })

  it('fica no volume cheio na abertura', () => {
    expect(gainAt(k, 1.2)).toBeCloseTo(0.6)
  })

  it('abaixa a trilha antes da fala e mantém durante os slots', () => {
    expect(gainAt(k, 1.5)).toBeCloseTo(0.6)
    expect(gainAt(k, 2)).toBeCloseTo(0.1)
    expect(gainAt(k, 6)).toBeCloseTo(0.1)
    expect(gainAt(k, 8.9)).toBeCloseTo(0.1)
  })

  it('sobe a trilha depois da última fala e faz fade-out', () => {
    expect(gainAt(k, 9.5)).toBeCloseTo(0.6)
    expect(gainAt(k, 11)).toBeCloseTo(0.3)
  })

  it('tem tempos não decrescentes', () => {
    for (let i = 1; i < k.length; i++) expect(k[i]!.time).toBeGreaterThan(k[i - 1]!.time)
  })

  it('sem trilha, não há curva', () => {
    const t = makeTemplate({ music: undefined })
    expect(musicGainKeyframes(t, buildTimeline(t, { a: 4, b: 3 }))).toEqual([])
  })
})

describe('trilha com clipes', () => {
  const clip = { id: 'v', label: 'V', asset: 'v.mp4', after: 'a', duration: 2 }

  it('mantém a trilha baixa durante um clipe com duckMusic', () => {
    const t = makeTemplate({ clips: [clip] }) // intro 0–2, a 2–6, clipe 6–8, b 8–11, outro 11–14
    const k = musicGainKeyframes(t, buildTimeline(t, { a: 4, b: 3 }))
    expect(gainAt(k, 7)).toBeCloseTo(0.1)
  })

  it('sobe a trilha no clipe sem duckMusic e volta a abaixar na fala seguinte', () => {
    const t = makeTemplate({ clips: [{ ...clip, duckMusic: false }] })
    const k = musicGainKeyframes(t, buildTimeline(t, { a: 4, b: 3 }))
    expect(gainAt(k, 7)).toBeCloseTo(0.6)
    expect(gainAt(k, 8.6)).toBeCloseTo(0.1)
  })
})

describe('normalização', () => {
  const sine = (amp: number) => Float32Array.from({ length: 48000 }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / 48000))

  it('mede RMS e pico', () => {
    const { rmsDb, peak } = measureLevel([sine(0.5)])
    expect(peak).toBeCloseTo(0.5, 2)
    expect(rmsDb).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2), 1)
  })

  it('aumenta fala baixa até o alvo, sem passar do ganho máximo', () => {
    const quiet = measureLevel([sine(0.01)])
    const g = normalizationGain(quiet, -20, 12)
    expect(20 * Math.log10(g)).toBeCloseTo(12)
  })

  it('não deixa o pico passar de 0 dBFS', () => {
    const loud = measureLevel([sine(0.9)])
    const g = normalizationGain(loud, -3, 12)
    expect(g * loud.peak).toBeLessThanOrEqual(0.99 + 1e-9)
  })

  it('silêncio fica com ganho 1', () => {
    expect(normalizationGain(measureLevel([new Float32Array(100)]), -20, 12)).toBe(1)
  })
})
