import { describe, expect, it } from 'vitest'
import { parseTemplate, templateAssets } from '@takeslot/schema'
import { findTemplate } from '@takeslot/templates'
import { describePath, newClip, newSlot, newTemplate, placeholderDuration, remapAssets, slugify, uniqueId } from '../src/admin/templates'

describe('utilitários do admin', () => {
  it('slugify e ids únicos', () => {
    expect(slugify('Apresentação Inicial!')).toBe('apresentacao-inicial')
    expect(uniqueId('Fala', ['fala', 'fala-2'])).toBe('fala-3')
  })

  it('template novo é válido em todos os formatos', () => {
    for (const aspect of ['9:16', '16:9', '1:1'] as const) {
      expect(() => parseTemplate(newTemplate('novo', 'Novo', aspect))).not.toThrow()
    }
  })

  it('itens novos não colidem com ids existentes', () => {
    const t = newTemplate('novo', 'Novo', '9:16')
    const slot = newSlot(t, 'Apresentação')
    expect(slot.id).toBe('apresentacao-2')
    const clip = newClip(t, { key: 'abc.mp4', name: 'Apresentação.mp4', duration: 3.456 })
    expect(clip.id).toBe('apresentacao-2')
    expect(clip.duration).toBe(3.46)
  })

  it('remapAssets troca todas as referências', () => {
    const t = findTemplate('depoimento-vertical')!.template
    const { images, audio, videos } = templateAssets(t)
    const map = Object.fromEntries([...images, ...audio, ...videos].map((n) => [n, `r2-${n}`]))
    const remapped = templateAssets(remapAssets(t, map))
    expect([...remapped.images, ...remapped.audio, ...remapped.videos].every((n) => n.startsWith('r2-'))).toBe(true)
  })

  it('duração de marcador respeita mínimo e máximo', () => {
    const t = newTemplate('novo', 'Novo', '9:16')
    expect(placeholderDuration({ ...t.slots[0]!, minDuration: 2, maxDuration: 4 })).toBe(4)
    expect(placeholderDuration({ ...t.slots[0]!, minDuration: 8, maxDuration: 20 })).toBe(8)
  })

  it('descreve caminhos de erro de forma legível', () => {
    const t = newTemplate('novo', 'Novo', '9:16')
    expect(describePath(t, 'slots.0.maxDuration')).toBe('Trecho “Apresentação” · maxDuration')
    expect(describePath(t, 'logo.asset')).toBe('Logo · asset')
  })
})
