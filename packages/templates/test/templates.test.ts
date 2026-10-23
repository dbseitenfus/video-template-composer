import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny'
import { describe, expect, it } from 'vitest'
import { outputSize } from '@takeslot/schema'
import { findTemplate, templates } from '../src'

const assetPath = (name: string) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url))
const fixedDuration = (t: (typeof templates)[number]['template']) =>
  (t.intro?.duration ?? 0) + (t.outro?.duration ?? 0) + t.clips.reduce((s, c) => s + c.duration, 0)

describe('templates', () => {
  it('carrega todos os arquivos da pasta', () => {
    const files = readdirSync(fileURLToPath(new URL('../templates', import.meta.url))).filter((f) => f.endsWith('.json'))
    expect(templates).toHaveLength(files.length)
    expect(templates[0]!.template.id).toBe('depoimento-vertical')
  })

  it('ids são únicos', () => {
    const ids = templates.map((t) => t.template.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(findTemplate(ids[0]!)).toBeDefined()
  })

  describe.each(templates.map((e) => [e.template.id, e] as const))('%s', (_, { template, assets }) => {
    it('tem todos os assets', () => {
      if (template.logo) expect(assets[template.logo.asset]).toBeTruthy()
      if (template.music) expect(assets[template.music.asset]).toBeTruthy()
      for (const clip of template.clips) expect(assets[clip.asset]).toBeTruthy()
    })

    it('cabe no limite de 3 minutos do produto', () => {
      const max = fixedDuration(template) + template.slots.reduce((s, x) => s + x.maxDuration, 0)
      expect(max).toBeLessThanOrEqual(180)
    })

    it('tem roteiro e rótulo em todos os trechos', () => {
      for (const slot of template.slots) {
        expect(slot.label.trim()).not.toBe('')
        expect(slot.script.length).toBeGreaterThan(20)
      }
    })

    it('clipes têm a proporção do template e duração suficiente', async () => {
      for (const clip of template.clips) {
        const input = new Input({ source: new FilePathSource(assetPath(clip.asset)), formats: ALL_FORMATS })
        const track = (await input.getPrimaryVideoTrack())!
        expect(track.codec).toBe('avc')
        expect(track.displayWidth / track.displayHeight).toBeCloseTo(template.canvas.width / template.canvas.height, 2)
        expect(await input.computeDuration()).toBeGreaterThanOrEqual(clip.trimStart + clip.duration - 0.05)
        input.dispose()
      }
    })

    it('gera tamanhos de saída pares', () => {
      for (const r of template.resolutions) {
        const { width, height } = outputSize(template, r)
        expect(width % 2 + height % 2).toBe(0)
      }
    })
  })
})
