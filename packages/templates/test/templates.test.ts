import { describe, expect, it } from 'vitest'
import { findTemplate, templates } from '../src'

describe('templates', () => {
  it('todos validam no schema e têm os assets', () => {
    expect(templates.length).toBeGreaterThan(0)
    for (const { template, assets } of templates) {
      expect(template.slots.length).toBeGreaterThan(0)
      if (template.logo) expect(assets[template.logo.asset]).toBeTruthy()
      if (template.music) expect(assets[template.music.asset]).toBeTruthy()
    }
  })

  it('ids são únicos', () => {
    const ids = templates.map((t) => t.template.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(findTemplate(ids[0]!)).toBeDefined()
  })
})
