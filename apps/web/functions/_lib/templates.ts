import { safeParseTemplate, templateAssets, type Template } from '@takeslot/schema'
import type { Env } from './env'

export interface TemplateRow {
  id: string
  draft: string
  sort: number
  archived: number
  created_at: number
  updated_at: number
}

export interface PublishedTemplate {
  template: Template
  version: number
  /** URL de cada asset referenciado, por nome (o nome é a chave no R2). */
  assets: Record<string, string>
}

export const assetUrl = (key: string) => `/api/assets/${encodeURIComponent(key)}`

export function withAssetUrls(template: Template, version: number): PublishedTemplate {
  const { images, audio, videos, thumbnail } = templateAssets(template)
  return { template, version, assets: Object.fromEntries([...images, ...audio, ...videos, ...thumbnail].map((k) => [k, assetUrl(k)])) }
}

/** Valida com o mesmo schema do app; devolve os erros com o caminho de cada campo. */
export function validate(data: unknown): { ok: true; template: Template } | { ok: false; issues: { path: string; message: string }[] } {
  const r = safeParseTemplate(data)
  if (r.success) return { ok: true, template: r.data }
  return { ok: false, issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }
}

/** Assets referenciados pelo template que não existem na biblioteca. */
export async function missingAssets(env: Env, template: Template): Promise<string[]> {
  const { images, audio, videos, thumbnail } = templateAssets(template)
  const keys = [...images, ...audio, ...videos, ...thumbnail]
  if (keys.length === 0) return []
  const { results } = await env.DB.prepare(`SELECT key FROM assets WHERE key IN (${keys.map(() => '?').join(',')})`)
    .bind(...keys)
    .all<{ key: string }>()
  const found = new Set(results.map((r) => r.key))
  return keys.filter((k) => !found.has(k))
}

export async function latestVersions(env: Env): Promise<Map<string, { version: number; json: string; published_at: number }>> {
  const { results } = await env.DB.prepare(
    `SELECT v.template_id, v.version, v.json, v.published_at FROM template_versions v
     WHERE v.version = (SELECT MAX(version) FROM template_versions WHERE template_id = v.template_id)`,
  ).all<{ template_id: string; version: number; json: string; published_at: number }>()
  return new Map(results.map((r) => [r.template_id, r]))
}
