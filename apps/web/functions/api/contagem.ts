import type { Env } from '../_lib/env'
import { brazilDay, parseUsage } from '../_lib/usage'

/**
 * Recebe eventos anônimos de uso (até 20 por envio) e soma nos contadores do dia.
 * Responde 204 sempre que o formato for válido: o app nunca depende desta rota.
 */
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const text = await request.text()
  if (text.length > 4096) return new Response(null, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return new Response(null, { status: 400 })
  }
  const list = Array.isArray((body as { events?: unknown })?.events) ? (body as { events: unknown[] }).events.slice(0, 20) : [body]
  const events = list.map(parseUsage).filter((e) => e !== null)
  if (events.length === 0) return new Response(null, { status: 400 })

  const day = brazilDay()
  const stmt = env.DB.prepare(
    `INSERT INTO usage_daily (day, event, template_id, device, count) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (day, event, template_id, device) DO UPDATE SET count = count + 1`,
  )
  await env.DB.batch(events.map((e) => stmt.bind(day, e.event, e.templateId, e.device)))
  return new Response(null, { status: 204 })
}
