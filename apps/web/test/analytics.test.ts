import { describe, expect, it } from 'vitest'
import { deviceClass, inAppSource, referrerSource, screenBucket } from '../src/lib/analytics'
import { byDim, daily, groupBy, rate, totals } from '../src/admin/usage'
import { brazilDay, brazilHour, geoInfo, parseUsage, uaInfo } from '../functions/_lib/usage'

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
      ctx: {},
    })
    expect(parseUsage({ event: 'roubar', templateId: 'x' })).toBeNull()
    expect(parseUsage({ event: 'visit', templateId: '<script>', device: 'tv', extra: 'ignorado' })).toEqual({
      event: 'visit',
      templateId: '',
      device: 'other',
      ctx: {},
    })
  })

  it('aceita só detalhes conhecidos e com texto seguro', () => {
    const ctx = { source: 'Instagram', campaign: 'Vídeo 3', lang: 'pt-BR', screen: '<b>', cpf: '123', display: 'x'.repeat(200) }
    expect(parseUsage({ event: 'visit', ctx })?.ctx).toEqual({ source: 'instagram', campaign: 'Vídeo 3', lang: 'pt-BR', display: 'x'.repeat(48) })
  })

  it('descobre a origem pelo referrer ou pelo app', () => {
    expect(referrerSource('https://l.instagram.com/?u=x', 'gravai.app')).toBe('instagram.com')
    expect(referrerSource('https://www.google.com.br/', 'gravai.app')).toBe('google')
    expect(referrerSource('https://gravai.app/gravar/a', 'gravai.app')).toBe('')
    expect(referrerSource('', 'gravai.app')).toBe('')
    expect(inAppSource('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe('instagram')
    expect(screenBucket(390)).toBe('360-413px')
  })

  it('servidor deduz navegador, sistema e localização aproximada', () => {
    expect(uaInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Mobile Instagram 350.0')).toEqual({ browser: 'Instagram (app)', os: 'iOS 18' })
    expect(uaInfo('Mozilla/5.0 (Linux; Android 14; SM-A146M) SamsungBrowser/25.0 Chrome/121 Safari/537')).toEqual({ browser: 'Samsung Internet', os: 'Android 14' })
    expect(uaInfo('Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537')).toEqual({ browser: 'Chrome', os: 'Windows' })
    expect(geoInfo({ country: 'BR', region: 'Rio Grande do Sul', regionCode: 'RS', city: 'Santa Maria', asOrganization: 'Claro NXT' })).toEqual({
      country: 'BR',
      region: 'Rio Grande do Sul',
      city: 'Santa Maria - RS',
      isp: 'Claro NXT',
    })
    expect(geoInfo({ country: 'PT', region: 'Lisboa' }).region).toBe('Lisboa (PT)')
    expect(geoInfo(undefined)).toEqual({})
    expect(brazilHour(new Date('2026-10-24T12:30:00Z'))).toBe('09h')
  })

  it('agrupa o público por dimensão', () => {
    const dims = [
      { dim: 'country', value: 'BR', event: 'visit', count: 8 },
      { dim: 'country', value: 'PT', event: 'visit', count: 2 },
      { dim: 'country', value: 'BR', event: 'export_done', count: 3 },
      { dim: 'source', value: 'direto', event: 'visit', count: 5 },
    ]
    expect(byDim(dims, 'country')).toEqual([
      { value: 'BR', label: 'Brasil', counts: { visit: 8, export_done: 3 } },
      { value: 'PT', label: 'Portugal', counts: { visit: 2 } },
    ])
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
