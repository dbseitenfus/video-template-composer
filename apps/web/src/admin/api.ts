import type { Template } from '@takeslot/schema'

/** Cliente da API do admin. O token fica só na sessão do navegador (sessionStorage). */

const TOKEN_KEY = 'takeslot:admin-token'

export interface Issue {
  path: string
  message: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: Issue[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface AdminTemplateSummary {
  id: string
  name: string
  archived: boolean
  sort: number
  updatedAt: number
  publishedVersion: number | null
  publishedAt: number | null
  dirty: boolean
}

export interface AdminTemplateDetail {
  template: Template
  archived: boolean
  sort: number
  publishedVersion: number | null
  dirty: boolean
}

export type AssetKind = 'image' | 'audio' | 'video'

export interface Asset {
  key: string
  name: string
  content_type: string
  kind: AssetKind
  size: number
  width: number | null
  height: number | null
  duration: number | null
  created_at: number
  url: string
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // sessionStorage indisponível: o token vale só enquanto a página estiver aberta
  }
}

async function request<T>(path: string, init: RequestInit = {}, token = getToken()): Promise<T> {
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (init.body && typeof init.body === 'string') headers.set('content-type', 'application/json')
  let response: Response
  try {
    response = await fetch(`/api/admin${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor')
  }
  const isJson = (response.headers.get('content-type') ?? '').includes('application/json')
  const body = isJson ? await response.json() : null
  if (!response.ok) {
    if (!isJson) throw new ApiError(response.status, 'A API do admin não respondeu. Em desenvolvimento, rode `npm run dev:api`.')
    throw new ApiError(response.status, body?.error ?? `Erro ${response.status}`, Array.isArray(body?.details) ? body.details : [])
  }
  return body as T
}

export const api = {
  /** Valida um token sem guardá-lo. */
  async checkToken(token: string) {
    await request('/templates', {}, token)
  },
  listTemplates: () => request<{ templates: AdminTemplateSummary[] }>('/templates').then((r) => r.templates),
  getTemplate: (id: string) => request<AdminTemplateDetail>(`/templates/${encodeURIComponent(id)}`),
  createTemplate: (template: unknown) =>
    request<{ template: Template }>('/templates', { method: 'POST', body: JSON.stringify(template) }).then((r) => r.template),
  saveTemplate: (id: string, template: unknown) =>
    request<{ template: Template }>(`/templates/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ template }) }).then((r) => r.template),
  updateMeta: (id: string, meta: { sort?: number; archived?: boolean }) =>
    request(`/templates/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(meta) }),
  publish: (id: string) => request<{ version: number }>(`/templates/${encodeURIComponent(id)}/publish`, { method: 'POST' }).then((r) => r.version),
  listAssets: () => request<{ assets: Asset[] }>('/assets').then((r) => r.assets),
  uploadAsset: (file: Blob, name: string, meta: { width?: number; height?: number; duration?: number } = {}) => {
    const headers: Record<string, string> = { 'content-type': file.type, 'x-file-name': encodeURIComponent(name) }
    if (meta.width) headers['x-width'] = String(meta.width)
    if (meta.height) headers['x-height'] = String(meta.height)
    if (meta.duration) headers['x-duration'] = String(meta.duration)
    return request<{ asset: Asset }>('/assets', { method: 'POST', body: file, headers }).then((r) => r.asset)
  },
  deleteAsset: (key: string) => request(`/assets/${encodeURIComponent(key)}`, { method: 'DELETE' }),
}
