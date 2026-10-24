import type { Env } from '../../../_lib/env'
import { json } from '../../../_lib/http'
import { brazilDay } from '../../../_lib/usage'

/** Contadores de uso dos últimos `days` dias (padrão 30, máximo 365). */
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 30))
  const since = brazilDay(new Date(Date.now() - (days - 1) * 86_400_000))
  const { results } = await env.DB.prepare(
    `SELECT day, event, template_id AS templateId, device, count FROM usage_daily WHERE day >= ? ORDER BY day`,
  )
    .bind(since)
    .all<{ day: string; event: string; templateId: string; device: string; count: number }>()
  return json({ since, today: brazilDay(), rows: results })
}
