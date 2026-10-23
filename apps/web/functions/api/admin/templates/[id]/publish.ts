import type { Env } from '../../../../_lib/env'
import { error, json } from '../../../../_lib/http'
import { missingAssets, validate, type TemplateRow } from '../../../../_lib/templates'

/**
 * Publica o rascunho como uma nova versão imutável. Quem já começou a gravar
 * com a versão anterior continua com ela (o app guarda uma cópia do template).
 */
export const onRequestPost: PagesFunction<Env, 'id'> = async ({ env, params }) => {
  const row = await env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(params.id).first<TemplateRow>()
  if (!row) return error(404, 'Template não encontrado')
  const result = validate(JSON.parse(row.draft))
  if (!result.ok) return error(422, 'Template inválido', result.issues)
  const missing = await missingAssets(env, result.template)
  if (missing.length) return error(422, 'Arquivos ausentes na biblioteca', missing.map((m) => ({ path: 'asset', message: m })))

  const last = await env.DB.prepare('SELECT MAX(version) AS v FROM template_versions WHERE template_id = ?').bind(row.id).first<{ v: number | null }>()
  const version = (last?.v ?? 0) + 1
  await env.DB.prepare('INSERT INTO template_versions (template_id, version, json, published_at) VALUES (?, ?, ?, ?)')
    .bind(row.id, version, row.draft, Date.now())
    .run()
  return json({ version })
}
