import { describe, expect, it } from 'vitest'
import { mergeByTimestamp, planChunks, TimestampSampler } from '../src'

class FakeSample {
  closed = false
  constructor(readonly timestamp: number) {}
  close() {
    this.closed = true
  }
}

async function* frames(timestamps: number[]) {
  for (const t of timestamps) yield new FakeSample(t)
}

describe('TimestampSampler', () => {
  it('pega o último frame com timestamp ≤ t, mesmo com frame rate variável', async () => {
    // 0, 0.03, 0.10 (buraco), 0.12, 0.2
    const s = new TimestampSampler(frames([0, 0.03, 0.1, 0.12, 0.2]))
    expect((await s.at(0))?.timestamp).toBe(0)
    expect((await s.at(1 / 30))?.timestamp).toBe(0.03)
    expect((await s.at(2 / 30))?.timestamp).toBe(0.03)
    expect((await s.at(3 / 30))?.timestamp).toBe(0.1)
    expect((await s.at(4 / 30))?.timestamp).toBe(0.12)
    expect((await s.at(1))?.timestamp).toBe(0.2)
  })

  it('fecha os frames que ficaram para trás', async () => {
    const made: FakeSample[] = []
    async function* src() {
      for (const t of [0, 0.1, 0.2, 0.3]) {
        const f = new FakeSample(t)
        made.push(f)
        yield f
      }
    }
    const s = new TimestampSampler(src())
    await s.at(0.25)
    expect(made.slice(0, 2).every((f) => f.closed)).toBe(true)
    expect(made[2]!.closed).toBe(false)
    s.close()
    expect(made.every((f) => f.closed)).toBe(true)
  })

  it('respeita a base (primeiro timestamp diferente de zero)', async () => {
    const s = new TimestampSampler(frames([1.5, 1.6, 1.7]), 1.5)
    expect((await s.at(0.1))?.timestamp).toBe(1.6)
  })

  it('rejeita tempos voltando', async () => {
    const s = new TimestampSampler(frames([0, 1]))
    await s.at(0.5)
    await expect(s.at(0.1)).rejects.toThrow()
  })
})

describe('planChunks', () => {
  it('divide em pedaços de tamanho fixo', () => {
    expect(planChunks(900, 30, 10).map((c) => [c.startFrame, c.endFrame])).toEqual([
      [0, 300],
      [300, 600],
      [600, 900],
    ])
  })

  it('junta um último pedaço muito curto ao anterior', () => {
    const c = planChunks(620, 30, 10)
    expect(c).toHaveLength(2)
    expect(c[1]).toEqual({ index: 1, startFrame: 300, endFrame: 620 })
  })

  it('cobre todos os frames sem sobreposição', () => {
    const c = planChunks(1234, 30, 7)
    expect(c[0]!.startFrame).toBe(0)
    expect(c[c.length - 1]!.endFrame).toBe(1234)
    for (let i = 1; i < c.length; i++) expect(c[i]!.startFrame).toBe(c[i - 1]!.endFrame)
  })
})

describe('mergeByTimestamp', () => {
  it('intercala fluxos ordenados', async () => {
    async function* s(ts: number[]) {
      for (const timestamp of ts) yield { timestamp }
    }
    const out: string[] = []
    for await (const { key, item } of mergeByTimestamp([
      { key: 'v', iterator: s([0, 0.033, 0.066]) },
      { key: 'a', iterator: s([0, 0.021, 0.042, 0.064]) },
    ])) {
      out.push(`${key}${item.timestamp}`)
    }
    expect(out).toEqual(['v0', 'a0', 'a0.021', 'v0.033', 'a0.042', 'a0.064', 'v0.066'])
  })
})
