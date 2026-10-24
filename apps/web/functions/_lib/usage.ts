/** Eventos aceitos: as etapas do funil do app. */
export const USAGE_EVENTS = [
  'visit',
  'template_selected',
  'take_recorded',
  'export_started',
  'export_done',
  'export_failed',
  'shared',
] as const

export type UsageEvent = (typeof USAGE_EVENTS)[number]

export const DEVICES = ['ios', 'android', 'desktop', 'other'] as const

/** Detalhes que o navegador manda junto (todos opcionais e validados aqui). */
export const CLIENT_DIMS = ['source', 'medium', 'campaign', 'lang', 'display', 'screen', 'returning', 'connection'] as const

export type Dims = Record<string, string>

export interface UsagePayload {
  event: UsageEvent
  templateId: string
  device: (typeof DEVICES)[number]
  ctx: Dims
}

/** Eventos que levam os detalhes do público (trecho gravado fica de fora: são vários por vídeo). */
export const DIM_EVENTS: readonly UsageEvent[] = ['visit', 'template_selected', 'export_started', 'export_done', 'export_failed', 'shared']

const SAFE_VALUE = /^[\p{L}\p{N} .,_\-/()'+]{1,48}$/u

function clean(value: unknown): string {
  if (typeof value !== 'string') return ''
  const v = value.trim().slice(0, 48)
  return SAFE_VALUE.test(v) ? v : ''
}

/** Valida um evento vindo do navegador; descarta qualquer coisa fora do formato esperado. */
export function parseUsage(raw: unknown): UsagePayload | null {
  const r = raw as { event?: unknown; templateId?: unknown; device?: unknown; ctx?: unknown } | null
  if (!r || typeof r.event !== 'string' || !(USAGE_EVENTS as readonly string[]).includes(r.event)) return null
  const templateId = typeof r.templateId === 'string' && /^[a-z0-9-]{1,64}$/.test(r.templateId) ? r.templateId : ''
  const device = typeof r.device === 'string' && (DEVICES as readonly string[]).includes(r.device) ? (r.device as UsagePayload['device']) : 'other'
  const ctx: Dims = {}
  const rawCtx = r.ctx && typeof r.ctx === 'object' ? (r.ctx as Record<string, unknown>) : {}
  for (const key of CLIENT_DIMS) {
    const v = clean(rawCtx[key])
    if (v) ctx[key] = key === 'source' || key === 'medium' ? v.toLowerCase() : v
  }
  return { event: r.event as UsageEvent, templateId, device, ctx }
}

/** Navegador e sistema a partir do user-agent, destacando os navegadores internos de apps (Instagram, Facebook, TikTok). */
export function uaInfo(ua: string): { browser: string; os: string } {
  const browser = /Instagram/.test(ua)
    ? 'Instagram (app)'
    : /FBAN|FBAV|FB_IAB|FBIOS/.test(ua)
      ? 'Facebook (app)'
      : /musical_ly|TikTok|BytedanceWebview|Bytedance/.test(ua)
        ? 'TikTok (app)'
        : /WhatsApp/.test(ua)
          ? 'WhatsApp'
          : /SamsungBrowser/.test(ua)
            ? 'Samsung Internet'
            : /EdgA?\/|EdgiOS/.test(ua)
              ? 'Edge'
              : /OPR\/|Opera/.test(ua)
                ? 'Opera'
                : /Firefox|FxiOS/.test(ua)
                  ? 'Firefox'
                  : /CriOS|Chrome\//.test(ua)
                    ? 'Chrome'
                    : /Safari/.test(ua)
                      ? 'Safari'
                      : 'Outro'
  const ios = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+)_/)
  const android = ua.match(/Android (\d+)/)
  const os = ios
    ? `iOS ${ios[1]}`
    : android
      ? `Android ${android[1]}`
      : /Windows/.test(ua)
        ? 'Windows'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Outro'
  return { browser, os }
}

/** Localização aproximada que o Cloudflare deduz do IP (o IP em si nunca é guardado). */
export function geoInfo(cf: Record<string, unknown> | undefined): Dims {
  if (!cf) return {}
  const country = clean(cf.country)
  const region = clean(cf.region)
  const code = clean(cf.regionCode)
  const city = clean(cf.city)
  const isp = clean(cf.asOrganization)
  const out: Dims = {}
  if (country) out.country = country
  if (region) out.region = country && country !== 'BR' ? `${region} (${country})` : region
  if (city) out.city = code ? `${city} - ${code}` : city
  if (isp) out.isp = isp
  return out
}

/** Hora cheia em Brasília, para ver os horários de pico. */
export function brazilHour(date = new Date()): string {
  return `${String(new Date(date.getTime() - 3 * 3600_000).getUTCHours()).padStart(2, '0')}h`
}

/** Dia no fuso de Brasília, para os totais diários baterem com o calendário do público. */
export function brazilDay(date = new Date()): string {
  return new Date(date.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}
