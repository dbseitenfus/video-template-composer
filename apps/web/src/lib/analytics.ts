/*
 * Contagem de uso anônima: só o nome da etapa, o modelo e o tipo de aparelho,
 * somados por dia no servidor. Sem cookies, sem identificador de pessoa e nada
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

export function usagePayload(event: UsageEvent, templateId?: string) {
  return { event, templateId: templateId ?? '', device: deviceClass(navigator.userAgent, navigator.maxTouchPoints ?? 0) }
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
