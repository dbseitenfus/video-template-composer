import { describe, expect, it } from 'vitest'
import { deviceClass } from '../src/lib/analytics'
import { daily, groupBy, rate, totals } from '../src/admin/usage'
import { brazilDay, parseUsage } from '../functions/_lib/usage'

describe('contagem de uso', () => {
  it('classifica o aparelho de forma grosseira', () => {
    expect(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios')
    expect(deviceClass('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios') // iPad em modo desktop
    expect(deviceClass('Mozilla/5.0 (Linux; Android 14; SM-A146M)')).toBe('android')
    expect(deviceClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop')
    expect(deviceClass('bot')).toBe('other')
  })

  it('servidor aceita só eventos conhecidos e limpa o resto', () => {
    expect(parseUsage({ event: 'export_done', templateId: 'depoimento-vertical', device: 'ios' })).toEqual({
      event: 'export_done',
      templateId: 'depoimento-vertical',
      device: 'ios',
    })
    expect(parseUsage({ event: 'roubar', templateId: 'x' })).toBeNull()
    expect(parseUsage({ event: 'visit', templateId: '<script>', device: 'tv', extra: 'ignorado' })).toEqual({
      event: 'visit',
      templateId: '',
      device: 'other',
    })
  })

  it('usa o dia de Brasília', () => {
    expect(brazilDay(new Date('2026-10-25T02:30:00Z'))).toBe('2026-10-24')
    expect(brazilDay(new Date('2026-10-25T03:30:00Z'))).toBe('2026-10-25')
  })

  const rows = [
    { day: '2026-10-23', event: 'visit', templateId: '', device: 'ios', count: 10 },
    { day: '2026-10-24', event: 'visit', templateId: '', device: 'android', count: 5 },
    { day: '2026-10-24', event: 'export_started', templateId: 'a', device: 'ios', count: 4 },
    { day: '2026-10-24', event: 'export_done', templateId: 'a', device: 'ios', count: 3 },
    { day: '2026-10-24', event: 'export_failed', templateId: 'a', device: 'android', count: 1 },
  ]

  it('soma, agrupa e completa os dias sem registro', () => {
    expect(totals(rows)).toMatchObject({ visit: 15, export_done: 3 })
    expect(groupBy(rows, 'templateId').get('a')).toEqual({ export_started: 4, export_done: 3, export_failed: 1 })
    expect(groupBy(rows, 'device').get('android')).toEqual({ visit: 5, export_failed: 1 })
    expect(daily(rows, 'visit', '2026-10-22', '2026-10-24')).toEqual([
      { day: '2026-10-22', count: 0 },
      { day: '2026-10-23', count: 10 },
      { day: '2026-10-24', count: 5 },
    ])
    expect(rate(3, 4)).toBe('75%')
    expect(rate(1, 0)).toBe('—')
  })
})
