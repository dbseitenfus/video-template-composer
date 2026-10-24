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

export interface UsagePayload {
  event: UsageEvent
  templateId: string
  device: (typeof DEVICES)[number]
}

/** Valida um evento vindo do navegador; descarta qualquer coisa fora do formato esperado. */
export function parseUsage(raw: unknown): UsagePayload | null {
  const r = raw as { event?: unknown; templateId?: unknown; device?: unknown } | null
  if (!r || typeof r.event !== 'string' || !(USAGE_EVENTS as readonly string[]).includes(r.event)) return null
  const templateId = typeof r.templateId === 'string' && /^[a-z0-9-]{1,64}$/.test(r.templateId) ? r.templateId : ''
  const device = typeof r.device === 'string' && (DEVICES as readonly string[]).includes(r.device) ? (r.device as UsagePayload['device']) : 'other'
  return { event: r.event as UsageEvent, templateId, device }
}

/** Dia no fuso de Brasília, para os totais diários baterem com o calendário do público. */
export function brazilDay(date = new Date()): string {
  return new Date(date.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}
