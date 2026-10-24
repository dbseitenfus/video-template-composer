import type { UsageRow } from './api'

/** Agregações do painel de uso (funções puras, testadas). */

export type EventName = 'visit' | 'template_selected' | 'take_recorded' | 'export_started' | 'export_done' | 'export_failed' | 'shared'
export type Counts = Partial<Record<EventName, number>>

export const EVENT_LABELS: Record<string, string> = {
  visit: 'Visitas',
  template_selected: 'Modelos escolhidos',
  take_recorded: 'Trechos gravados',
  export_started: 'Exportações iniciadas',
  export_done: 'Vídeos prontos',
  export_failed: 'Exportações com falha',
  shared: 'Compartilhados ou baixados',
}

export const DEVICE_LABELS: Record<string, string> = { ios: 'iPhone/iPad', android: 'Android', desktop: 'Computador', other: 'Outro' }

export function totals(rows: UsageRow[]): Counts {
  const out: Counts = {}
  for (const r of rows) {
    const e = r.event as EventName
    out[e] = (out[e] ?? 0) + r.count
  }
  return out
}

/** Série diária de um evento, com zero nos dias sem registro. */
export function daily(rows: UsageRow[], event: string, since: string, today: string): { day: string; count: number }[] {
  const byDay = new Map<string, number>()
  for (const r of rows) if (r.event === event) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.count)
  const out: { day: string; count: number }[] = []
  for (let d = new Date(`${since}T12:00:00Z`); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10)
    out.push({ day, count: byDay.get(day) ?? 0 })
  }
  return out
}

export function groupBy(rows: UsageRow[], key: 'templateId' | 'device'): Map<string, Counts> {
  const out = new Map<string, Counts>()
  for (const r of rows) {
    const k = r[key]
    if (!k) continue
    const bucket = out.get(k) ?? {}
    const e = r.event as EventName
    bucket[e] = (bucket[e] ?? 0) + r.count
    out.set(k, bucket)
  }
  return out
}

export function rate(part: number | undefined, whole: number | undefined): string {
  if (!whole) return '—'
  return `${Math.round(((part ?? 0) / whole) * 100)}%`
}
