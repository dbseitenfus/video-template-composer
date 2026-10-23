import type { Env } from '../../../_lib/env'
import { error, json } from '../../../_lib/http'
import { assetUrl } from '../../../_lib/templates'

export interface AssetRow {
  key: string
  name: string
  content_type: string
  kind: 'image' | 'audio' | 'video'
  size: number
  width: number | null
  height: number | null
  duration: number | null
  created_at: number
}

const MAX_BYTES = 95 * 1024 * 1024 // o Pages aceita corpos de até 100 MB

const EXTENSIONS: Record<string, { ext: string; kind: AssetRow['kind'] }> = {
  'image/svg+xml': { ext: 'svg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'audio/wav': { ext: 'wav', kind: 'audio' },
  'audio/x-wav': { ext: 'wav', kind: 'audio' },
  'audio/mpeg': { ext: 'mp3', kind: 'audio' },
  'audio/mp4': { ext: 'm4a', kind: 'audio' },
  'audio/aac': { ext: 'aac', kind: 'audio' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare('SELECT * FROM assets ORDER BY created_at DESC').all<AssetRow>()
  return json({ assets: results.map((a) => ({ ...a, url: assetUrl(a.key) })) })
}

/**
 * Upload de um arquivo (corpo cru). Metadados vão em cabeçalhos:
 * `x-file-name` (nome original, URL-encoded) e, para vídeos, `x-width`, `x-height`, `x-duration`
 * (medidos no navegador do admin).
 */
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0]!.trim()
  const type = EXTENSIONS[contentType]
  if (!type) return error(415, `Tipo de arquivo não suportado: ${contentType || 'desconhecido'}`)
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) return error(413, 'Arquivo grande demais (máximo de 95 MB)')

  const data = await request.arrayBuffer()
  if (data.byteLength === 0) return error(400, 'Arquivo vazio')
  if (data.byteLength > MAX_BYTES) return error(413, 'Arquivo grande demais (máximo de 95 MB)')
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('')
  const key = `${hash.slice(0, 24)}.${type.ext}`
  const name = decodeURIComponent(request.headers.get('x-file-name') ?? key).slice(0, 200)
  const num = (h: string) => {
    const v = Number(request.headers.get(h))
    return Number.isFinite(v) && v > 0 ? v : null
  }

  const existing = await env.DB.prepare('SELECT * FROM assets WHERE key = ?').bind(key).first<AssetRow>()
  if (existing) return json({ asset: { ...existing, url: assetUrl(key) } })

  await env.ASSETS_BUCKET.put(key, data, { httpMetadata: { contentType } })
  const row: AssetRow = {
    key,
    name,
    content_type: contentType,
    kind: type.kind,
    size: data.byteLength,
    width: num('x-width'),
    height: num('x-height'),
    duration: num('x-duration'),
    created_at: Date.now(),
  }
  await env.DB.prepare('INSERT INTO assets (key, name, content_type, kind, size, width, height, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(row.key, row.name, row.content_type, row.kind, row.size, row.width, row.height, row.duration, row.created_at)
    .run()
  return json({ asset: { ...row, url: assetUrl(key) } }, { status: 201 })
}
