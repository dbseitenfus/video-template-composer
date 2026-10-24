import type { Env } from '../../../_lib/env'
import { error, json } from '../../../_lib/http'
import { latestVersions, validate, type TemplateRow } from '../../../_lib/templates'
import type { Template } from '@takeslot/schema'

export interface AdminTemplateSummary {
  id: string
  name: string
  archived: boolean
  sort: number
  featured: boolean
  updatedAt: number
  publishedVersion: number | null
  publishedAt: number | null
  /** O rascunho tem mudanças ainda não publicadas. */
  dirty: boolean
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare('SELECT * FROM templates ORDER BY archived, sort, created_at').all<TemplateRow>()
  const versions = await latestVersions(env)
  const templates: AdminTemplateSummary[] = results.map((row) => {
    const draft = JSON.parse(row.draft) as Template
    const v = versions.get(row.id)
    return {
      id: row.id,
      name: draft.name,
      archived: !!row.archived,
      sort: row.sort,
      featured: !!row.featured,
      updatedAt: row.updated_at,
      publishedVersion: v?.version ?? null,
      publishedAt: v?.published_at ?? null,
      dirty: !v || v.json !== row.draft,
    }
  })
  return json({ templates })
}

/** Cria um template novo (rascunho). */
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const result = validate(await request.json().catch(() => null))
  if (!result.ok) return error(422, 'Template inválido', result.issues)
  const { template } = result
  const exists = await env.DB.prepare('SELECT 1 FROM templates WHERE id = ?').bind(template.id).first()
  if (exists) return error(409, `Já existe um template com id "${template.id}"`)
  const now = Date.now()
  const max = await env.DB.prepare('SELECT COALESCE(MAX(sort), -1) AS s FROM templates').first<{ s: number }>()
  await env.DB.prepare('INSERT INTO templates (id, draft, sort, archived, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)')
    .bind(template.id, JSON.stringify(template), (max?.s ?? -1) + 1, now, now)
    .run()
  return json({ template }, { status: 201 })
}
