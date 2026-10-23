import { describe, expect, it } from 'vitest'
import { buildTimeline, fitRect, interpolate, layerState, renderFrame, transitionOpacity, wrapText } from '../src'
import { makeTemplate } from './fixtures'
import type { Layer } from '@takeslot/schema'

/** Contexto 2D falso que registra as chamadas. */
function fakeCtx(width = 108, height = 192) {
  const calls: { op: string; args: unknown[]; fillStyle?: unknown; alpha?: number }[] = []
  const state = { fillStyle: '' as unknown, globalAlpha: 1, font: '10px sans-serif' }
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args, fillStyle: state.fillStyle, alpha: state.globalAlpha })
    }
  const ctx = new Proxy(
    {
      canvas: { width, height },
      measureText: (text: string) => ({ width: text.length * 5 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop]
        if (prop in state) return state[prop as keyof typeof state]
        return record(prop)
      },
      set(target, prop: string, value) {
        if (prop in state) (state as Record<string, unknown>)[prop] = value
        else target[prop] = value
        return true
      },
    },
  )
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const template = makeTemplate()
const timeline = buildTimeline(template, { a: 4, b: 3 })

describe('renderFrame', () => {
  it('desenha o fundo da abertura e o texto interpolado', () => {
    const { ctx, calls } = fakeCtx()
    renderFrame(ctx, template, 1, { timeline, images: {} })
    expect(calls.some((c) => c.op === 'fillRect' && c.fillStyle === '#112233')).toBe(true)
    expect(calls.find((c) => c.op === 'fillText')?.args[0]).toBe('Teste')
  })

  it('desenha o frame do take dentro do slot', () => {
    const { ctx, calls } = fakeCtx()
    const image = {} as CanvasImageSource
    renderFrame(ctx, template, 3, { timeline, images: {}, frame: { image, width: 1920, height: 1080 } })
    const draw = calls.find((c) => c.op === 'drawImage' && c.args[0] === image)
    expect(draw).toBeDefined()
    // 1920x1080 em cover num canvas 108x192: altura preenche o canvas
    expect(draw!.args[4]).toBeCloseTo(192)
  })

  it('é determinística: mesmas entradas, mesmas chamadas', () => {
    const a = fakeCtx()
    const b = fakeCtx()
    renderFrame(a.ctx, template, 5.5, { timeline, images: {} })
    renderFrame(b.ctx, template, 5.5, { timeline, images: {} })
    expect(JSON.stringify(a.calls)).toBe(JSON.stringify(b.calls))
  })

  it('escurece no início do vídeo (fade-black)', () => {
    const { ctx, calls } = fakeCtx()
    renderFrame(ctx, template, 0, { timeline, images: {} })
    const last = calls.filter((c) => c.op === 'fillRect').pop()!
    expect(last.fillStyle).toBe('#000000')
    expect(last.alpha).toBe(1)
  })
})

describe('layerState', () => {
  const layer = { type: 'text', text: 'x', x: 0.5, y: 0.5, start: 1, end: -1, animation: 'fade', animationDuration: 0.5 } as Layer

  it('respeita início e fim relativo ao fim do segmento', () => {
    expect(layerState(layer, 0.5, 5).visible).toBe(false)
    expect(layerState(layer, 2, 5)).toMatchObject({ visible: true, opacity: 1 })
    expect(layerState(layer, 4.5, 5).visible).toBe(false)
  })

  it('anima entrada e saída', () => {
    const entering = layerState(layer, 1.25, 5).opacity
    expect(entering).toBeGreaterThan(0)
    expect(entering).toBeLessThan(1)
    expect(layerState(layer, 3.9, 5).opacity).toBeLessThan(1)
  })
})

describe('utilitários', () => {
  it('interpolate troca variáveis conhecidas e mantém as outras', () => {
    expect(interpolate('{{slot.label}} – {{x}}', { 'slot.label': 'Oi' })).toBe('Oi – {{x}}')
  })

  it('wrapText quebra por largura e respeita \\n', () => {
    const ctx = { font: 'x', measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as CanvasRenderingContext2D
    expect(wrapText(ctx, 'um dois tres quatro', 90)).toEqual(['um dois', 'tres', 'quatro'])
    expect(wrapText(ctx, 'a\nb', 1000)).toEqual(['a', 'b'])
  })

  it('fitRect em cover e contain', () => {
    expect(fitRect(200, 100, 100, 100, 'cover')).toEqual({ x: -50, y: 0, width: 200, height: 100 })
    expect(fitRect(200, 100, 100, 100, 'contain')).toEqual({ x: 0, y: 25, width: 100, height: 50 })
  })

  it('transitionOpacity é 1 no meio do segmento', () => {
    const seg = timeline.segments[1]!
    expect(transitionOpacity(template, seg, 2)).toBe(1)
    expect(transitionOpacity(template, seg, 0)).toBe(0)
  })
})
