import { safeParseTemplate } from '@takeslot/schema'
import { templates as bundled, type TemplateEntry } from '@takeslot/templates'
import { loadJson, saveJson } from './storage'

/*
 * Catálogo de templates: vem da API (publicados no admin). Sem rede, usa a última
 * lista recebida; sem API (desenvolvimento sem backend, ou nada publicado ainda),
 * usa os templates embutidos no app.
 */

const CACHE_KEY = 'takeslot:catalog'

export type CatalogSource = 'api' | 'cache' | 'bundled'

export interface Catalog {
  entries: TemplateEntry[]
  source: CatalogSource
}

/** Revalida cada template recebido com o schema do app; descarta os inválidos. */
export function parseCatalog(data: unknown): TemplateEntry[] {
  const list = (data as { templates?: unknown[] } | null)?.templates
  if (!Array.isArray(list)) return []
  const entries: TemplateEntry[] = []
  for (const item of list) {
    const raw = item as { template?: unknown; assets?: Record<string, string>; version?: number; featured?: boolean }
    const parsed = safeParseTemplate(raw.template)
    if (parsed.success && raw.assets) entries.push({ template: parsed.data, assets: raw.assets, version: raw.version, ...(raw.featured === true ? { featured: true } : {}) })
  }
  return entries
}

export async function loadCatalog(fetchImpl: typeof fetch = fetch): Promise<Catalog> {
  try {
    const response = await fetchImpl('/api/templates', { headers: { accept: 'application/json' } })
    if (response.ok && (response.headers.get('content-type') ?? '').includes('application/json')) {
      const entries = parseCatalog(await response.json())
      if (entries.length > 0) {
        saveJson(CACHE_KEY, { templates: entries })
        return { entries, source: 'api' }
      }
      return { entries: bundled, source: 'bundled' }
    }
  } catch {
    // Sem rede ou sem backend: cai para o cache.
  }
  const cached = parseCatalog(loadJson(CACHE_KEY, null))
  return cached.length ? { entries: cached, source: 'cache' } : { entries: bundled, source: 'bundled' }
}
