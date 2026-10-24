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

  it('desenha o frame do clipe com o enquadramento e o rótulo do clipe', () => {
    const t = makeTemplate({
      clips: [{ id: 'v', label: 'Vinheta', asset: 'v.mp4', after: 'a', duration: 2, fit: 'contain', background: '#123456', layers: [{ type: 'text', text: '{{slot.label}}', x: 0.5, y: 0.5, animation: 'none' }] }],
    })
    const tl = buildTimeline(t, { a: 4, b: 3 })
    const { ctx, calls } = fakeCtx()
    const image = {} as CanvasImageSource
    renderFrame(ctx, t, 7, { timeline: tl, images: {}, frame: { image, width: 1920, height: 1080 } })
    expect(calls.some((c) => c.op === 'fillRect' && c.fillStyle === '#123456')).toBe(true)
    const draw = calls.find((c) => c.op === 'drawImage' && c.args[0] === image)!
    // contain: largura preenche o canvas de 108 px
    expect(draw.args[3]).toBeCloseTo(108)
    expect(calls.find((c) => c.op === 'fillText')?.args[0]).toBe('Vinheta')
  })

  it('desenha a marca de URL no canto inferior direito, também durante o escurecimento', () => {
    const { ctx, calls } = fakeCtx()
    renderFrame(ctx, template, 0, { timeline, images: {}, watermark: 'gravai.pages.dev' })
    const markIndex = calls.findIndex((c) => c.op === 'fillText' && c.args[0] === 'gravai.pages.dev')
    const fadeIndex = calls.map((c) => c.op).lastIndexOf('fillRect')
    expect(markIndex).toBeGreaterThan(fadeIndex)
    const mark = calls[markIndex]!
    expect(mark.args[1]).toBeLessThan(108)
    expect(mark.args[2]).toBeGreaterThan(192 * 0.9)
  })

  it('sobe a marca de URL quando há logo no canto inferior direito', () => {
    const t = makeTemplate({ logo: { asset: 'logo.svg', position: 'bottom-right', width: 0.3 } })
    const tl = buildTimeline(t, { a: 4, b: 3 })
    const logo = { image: {} as CanvasImageSource, width: 100, height: 50 }
    const { ctx, calls } = fakeCtx()
    renderFrame(ctx, t, 3, { timeline: tl, images: { 'logo.svg': logo }, frame: null, watermark: 'gravai.pages.dev' })
    const drawLogo = calls.find((c) => c.op === 'drawImage' && c.args[0] === logo.image)!
    const logoTop = drawLogo.args[2] as number
    const mark = calls.filter((c) => c.op === 'fillText').pop()!
    expect(mark.args[2]).toBeLessThan(logoTop)
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
