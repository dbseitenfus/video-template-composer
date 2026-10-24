/*
 * Contagem de uso anônima: a etapa, o modelo, o tipo de aparelho e alguns detalhes
 * gerais (de onde veio, idioma, app instalado ou navegador, tamanho de tela, conexão),
 * somados por dia no servidor. A localização aproximada, o navegador e o sistema o
 * servidor deduz sozinho, sem guardar o IP. Sem cookies, sem identificador de pessoa e nada
 * dos vídeos. Como nada identifica ninguém, conta todos os navegadores (inclusive
 * com "Não rastrear" ligado, que antes ficavam de fora e escondiam parte do público).
 */

export type UsageEvent = 'visit' | 'template_selected' | 'take_recorded' | 'export_started' | 'export_done' | 'export_failed' | 'shared'

export type Device = 'ios' | 'android' | 'desktop' | 'other'

export function deviceClass(ua: string, touchPoints = 0): Device {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop'
  return 'other'
}

/** Endereço com nome neutro: bloqueadores de anúncio costumam barrar caminhos como "/events". */
export const ENDPOINT = '/api/contagem'

export type UsageContext = Record<string, string>

/** Domínio de quem mandou a pessoa, sem "www.", "l.", "m." (links encurtados do Instagram/Facebook). */
export function referrerSource(referrer: string, ownHost: string): string {
  try {
    const host = new URL(referrer).hostname.replace(/^(www|l|lm|m|mobile)\./, '')
    if (!host || host === ownHost.replace(/^www\./, '')) return ''
    if (/(^|\.)google\./.test(host)) return 'google'
    if (host === 't.co') return 'x'
    if (host === 'wa.me' || host.endsWith('whatsapp.com')) return 'whatsapp'
    return host
  } catch {
    return ''
  }
}

/** Navegadores internos que costumam chegar sem referrer: dá para saber a origem pelo user-agent. */
export function inAppSource(ua: string): string {
  if (/Instagram/.test(ua)) return 'instagram'
  if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) return 'facebook'
  if (/musical_ly|TikTok|Bytedance/.test(ua)) return 'tiktok'
  if (/WhatsApp/.test(ua)) return 'whatsapp'
  return ''
}

export function screenBucket(width: number): string {
  if (width < 360) return 'até 359px'
  if (width < 414) return '360-413px'
  if (width < 768) return '414-767px'
  if (width < 1280) return '768-1279px'
  return '1280px ou mais'
}

/** Origem, campanha e se é a primeira visita: lidos na entrada e guardados na sessão, para os eventos seguintes. */
function attribution(): UsageContext {
  try {
    const saved = sessionStorage.getItem('gravai:origem')
    if (saved) return JSON.parse(saved) as UsageContext
  } catch {
    // sem sessionStorage: calcula de novo
  }
  const params = new URLSearchParams(location.search)
  const out: UsageContext = {
    source: params.get('utm_source') || referrerSource(document.referrer, location.hostname) || inAppSource(navigator.userAgent) || 'direto',
    medium: params.get('utm_medium') ?? '',
    campaign: params.get('utm_campaign') ?? '',
  }
  try {
    out.returning = localStorage.getItem('gravai:visto') ? 'recorrente' : 'nova'
    localStorage.setItem('gravai:visto', '1')
  } catch {
    // sem localStorage: não dá para saber
  }
  try {
    sessionStorage.setItem('gravai:origem', JSON.stringify(out))
  } catch {
    // tudo bem
  }
  return out
}

export function usageContext(): UsageContext {
  const standalone = matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  const connection = (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? ''
  return {
    ...attribution(),
    lang: navigator.language ?? '',
    display: standalone ? 'App instalado' : 'Navegador',
    screen: screenBucket(window.innerWidth),
    connection,
  }
}

export function usagePayload(event: UsageEvent, templateId?: string) {
  let ctx: UsageContext = {}
  try {
    ctx = usageContext()
  } catch {
    // detalhes são opcionais
  }
  return { event, templateId: templateId ?? '', device: deviceClass(navigator.userAgent, navigator.maxTouchPoints ?? 0), ctx }
}

/** Envia um evento sem atrasar nada: usa sendBeacon e ignora qualquer falha. */
export function track(event: UsageEvent, templateId?: string): void {
  try {
    if (typeof navigator === 'undefined') return
    const body = JSON.stringify(usagePayload(event, templateId))
    const blob = new Blob([body], { type: 'application/json' })
    if (navigator.sendBeacon?.(ENDPOINT, blob)) return
    void fetch(ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {})
  } catch {
    // Contagem de uso nunca atrapalha o app.
  }
}

/** Uma visita por sessão do navegador (não conta recarregamentos). */
export function trackVisit(): void {
  try {
    if (sessionStorage.getItem('gravai:visit')) return
    sessionStorage.setItem('gravai:visit', '1')
  } catch {
    // sem sessionStorage: conta mesmo assim
  }
  track('visit')
}
