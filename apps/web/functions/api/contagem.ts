import type { Env } from '../_lib/env'
import { brazilDay, brazilHour, DIM_EVENTS, geoInfo, parseUsage, uaInfo } from '../_lib/usage'

/**
 * Recebe eventos anônimos de uso (até 20 por envio) e soma nos contadores do dia.
 * Os detalhes do público (localização aproximada, origem, navegador...) vão para
 * `usage_dims`, uma contagem por dimensão, sem cruzar dimensões e sem guardar o IP.
 * Responde 204 sempre que o formato for válido: o app nunca depende desta rota.
 */
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const text = await request.text()
  if (text.length > 16384) return new Response(null, { status: 413 })
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
  const dimStmt = env.DB.prepare(
    `INSERT INTO usage_dims (day, event, dim, value, count) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (day, event, dim, value) DO UPDATE SET count = count + 1`,
  )
  const server = {
    ...geoInfo(request.cf as Record<string, unknown> | undefined),
    ...uaInfo(request.headers.get('user-agent') ?? ''),
    hour: brazilHour(),
  }
  const statements = events.flatMap((e) => {
    const base = stmt.bind(day, e.event, e.templateId, e.device)
    if (!DIM_EVENTS.includes(e.event)) return [base]
    const dims = Object.entries({ ...e.ctx, ...server }).filter(([, v]) => v)
    return [base, ...dims.map(([dim, value]) => dimStmt.bind(day, e.event, dim, value))]
  })
  await env.DB.batch(statements)
  return new Response(null, { status: 204 })
}
