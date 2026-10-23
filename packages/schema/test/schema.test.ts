import { describe, expect, it } from 'vitest'
import { outputSize, parseTemplate, safeParseTemplate, templateAssets } from '../src'

const minimal = {
  schemaVersion: 1,
  id: 'teste',
  name: 'Teste',
  canvas: { width: 1080, height: 1920 },
  slots: [{ id: 'fala-1', label: 'Fala', script: 'Olá', maxDuration: 20 }],
}

describe('TemplateSchema', () => {
  it('aplica os defaults', () => {
    const t = parseTemplate(minimal)
    expect(t.fps).toBe(30)
    expect(t.resolutions).toEqual([1080, 720])
    expect(t.transition).toEqual({ type: 'fade-black', duration: 0.3 })
    expect(t.slots[0]!.fit).toBe('cover')
    expect(t.slots[0]!.minDuration).toBe(2)
  })

  it('rejeita slots duplicados', () => {
    const r = safeParseTemplate({ ...minimal, slots: [minimal.slots[0], minimal.slots[0]] })
    expect(r.success).toBe(false)
  })

  it('rejeita cor inválida e posição fora de 0–1', () => {
    const bad = {
      ...minimal,
      intro: { duration: 2, background: { type: 'color', color: 'red' }, layers: [{ type: 'text', text: 'x', x: 2, y: 0.5 }] },
    }
    const r = safeParseTemplate(bad)
    expect(r.success).toBe(false)
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('intro.background.color')
      expect(paths).toContain('intro.layers.0.x')
    }
  })

  it('rejeita minDuration >= maxDuration', () => {
    const r = safeParseTemplate({ ...minimal, slots: [{ ...minimal.slots[0], minDuration: 30 }] })
    expect(r.success).toBe(false)
  })

  it('lista os assets usados', () => {
    const t = parseTemplate({
      ...minimal,
      logo: { asset: 'logo.svg' },
      music: { asset: 'trilha.wav' },
      outro: { duration: 2, background: { type: 'color', color: '#000' }, layers: [{ type: 'image', asset: 'selo.png', x: 0.5, y: 0.5, width: 0.3 }] },
    })
    expect(templateAssets(t)).toEqual({ images: ['selo.png', 'logo.svg'], audio: ['trilha.wav'] })
  })

  it('calcula tamanhos pares de saída', () => {
    const t = parseTemplate(minimal)
    expect(outputSize(t, 1080)).toEqual({ width: 1080, height: 1920 })
    expect(outputSize(t, 720)).toEqual({ width: 720, height: 1280 })
    const wide = parseTemplate({ ...minimal, canvas: { width: 1920, height: 1080 } })
    expect(outputSize(wide, 720)).toEqual({ width: 1280, height: 720 })
  })
})
