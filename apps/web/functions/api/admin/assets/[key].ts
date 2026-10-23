import type { Env } from '../../../_lib/env'
import { error, json } from '../../../_lib/http'

/** Remove um arquivo da biblioteca, desde que nenhum template (rascunho ou versão publicada) o use. */
export const onRequestDelete: PagesFunction<Env, 'key'> = async ({ env, params }) => {
  const key = String(params.key)
  const needle = `%"${key}"%`
  const used = await env.DB.prepare(
    `SELECT id FROM templates WHERE draft LIKE ?1
     UNION SELECT template_id FROM template_versions WHERE json LIKE ?1 LIMIT 5`,
  )
    .bind(needle)
    .all<{ id: string }>()
  if (used.results.length) return error(409, `Arquivo em uso por: ${used.results.map((r) => r.id).join(', ')}`)
  await env.ASSETS_BUCKET.delete(key)
  await env.DB.prepare('DELETE FROM assets WHERE key = ?').bind(key).run()
  return json({ deleted: key })
}
