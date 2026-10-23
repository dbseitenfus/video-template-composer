import type { Env } from '../../../_lib/env'
import { error, json } from '../../../_lib/http'
import { latestVersions, validate, type TemplateRow } from '../../../_lib/templates'

export const onRequestGet: PagesFunction<Env, 'id'> = async ({ env, params }) => {
  const row = await env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(params.id).first<TemplateRow>()
  if (!row) return error(404, 'Template não encontrado')
  const published = (await latestVersions(env)).get(row.id)
  return json({
    template: JSON.parse(row.draft),
    archived: !!row.archived,
    sort: row.sort,
    publishedVersion: published?.version ?? null,
    dirty: !published || published.json !== row.draft,
  })
}

/** Salva o rascunho (o id não muda). Aceita também `{ sort, archived }` para ordem e arquivamento. */
export const onRequestPut: PagesFunction<Env, 'id'> = async ({ env, params, request }) => {
  const body = (await request.json().catch(() => null)) as { template?: unknown; sort?: number; archived?: boolean } | null
  if (!body) return error(400, 'JSON inválido')
  const row = await env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(params.id).first<TemplateRow>()
  if (!row) return error(404, 'Template não encontrado')

  let draft = row.draft
  if (body.template !== undefined) {
    const result = validate(body.template)
    if (!result.ok) return error(422, 'Template inválido', result.issues)
    if (result.template.id !== row.id) return error(422, 'O id do template não pode mudar')
    draft = JSON.stringify(result.template)
  }
  const sort = typeof body.sort === 'number' ? Math.round(body.sort) : row.sort
  const archived = typeof body.archived === 'boolean' ? Number(body.archived) : row.archived
  await env.DB.prepare('UPDATE templates SET draft = ?, sort = ?, archived = ?, updated_at = ? WHERE id = ?')
    .bind(draft, sort, archived, Date.now(), row.id)
    .run()
  return json({ template: JSON.parse(draft), sort, archived: !!archived })
}
