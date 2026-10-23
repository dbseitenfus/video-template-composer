import type { Env } from '../../_lib/env'
import { json } from '../../_lib/http'
import { withAssetUrls } from '../../_lib/templates'
import type { Template } from '@takeslot/schema'

/** Templates publicados (última versão de cada um), na ordem definida no admin. Público. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT t.id, v.version, v.json FROM templates t
     JOIN template_versions v ON v.template_id = t.id
     WHERE t.archived = 0 AND v.version = (SELECT MAX(version) FROM template_versions WHERE template_id = t.id)
     ORDER BY t.sort, t.created_at`,
  ).all<{ id: string; version: number; json: string }>()
  const templates = results.map((r) => withAssetUrls(JSON.parse(r.json) as Template, r.version))
  return json({ templates }, { headers: { 'cache-control': 'public, max-age=60' } })
}
