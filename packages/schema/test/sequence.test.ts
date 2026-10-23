import { describe, expect, it } from 'vitest'
import { applySequence, moveItem, parseTemplate, templateSequence } from '../src'

const t = parseTemplate({
  schemaVersion: 1,
  id: 't',
  name: 'T',
  canvas: { width: 1080, height: 1920 },
  slots: [
    { id: 'a', label: 'A', script: 'a', maxDuration: 10 },
    { id: 'b', label: 'B', script: 'b', maxDuration: 10 },
  ],
  clips: [
    { id: 'v0', label: 'V0', asset: 'v0.mp4', after: 'intro', duration: 2 },
    { id: 'v1', label: 'V1', asset: 'v1.mp4', after: 'a', duration: 2 },
  ],
})

const ids = (items: ReturnType<typeof templateSequence>) => items.map((i) => (i.kind === 'slot' ? i.slot.id : i.clip.id))

describe('sequência', () => {
  it('lê a ordem do template', () => {
    expect(ids(templateSequence(t))).toEqual(['v0', 'a', 'v1', 'b'])
  })

  it('ida e volta preserva o template', () => {
    expect(applySequence(t, templateSequence(t))).toEqual(t)
  })

  it('qualquer ordem vira slots + after corretos', () => {
    const seq = templateSequence(t)
    // b, v1, v0, a
    const reordered = [seq[3]!, seq[2]!, seq[0]!, seq[1]!]
    const next = applySequence(t, reordered)
    expect(next.slots.map((s) => s.id)).toEqual(['b', 'a'])
    expect(next.clips.map((c) => [c.id, c.after])).toEqual([
      ['v1', 'b'],
      ['v0', 'b'],
    ])
    expect(ids(templateSequence(next))).toEqual(['b', 'v1', 'v0', 'a'])
    expect(parseTemplate(next)).toBeTruthy()
  })

  it('clipe no fim fica depois do último slot', () => {
    const seq = templateSequence(t)
    const next = applySequence(t, moveItem(seq, 0, 3))
    expect(ids(templateSequence(next))).toEqual(['a', 'v1', 'b', 'v0'])
  })

  it('moveItem limita os índices', () => {
    expect(moveItem([1, 2, 3], 0, 99)).toEqual([2, 3, 1])
    expect(moveItem([1, 2, 3], 2, -5)).toEqual([3, 1, 2])
  })
})
