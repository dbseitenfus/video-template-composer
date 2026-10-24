import { parseTemplate, templateAssets, type Template } from '@takeslot/schema'

const assetUrls = import.meta.glob('../assets/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export interface TemplateEntry {
  template: Template
  /** URL de cada asset referenciado, por nome do arquivo. */
  assets: Record<string, string>
  /** Versão publicada no admin; ausente nos templates embutidos no app. */
  version?: number
  /** Em destaque ("em alta") na página inicial; definido no admin. */
  featured?: boolean
}

function assetUrl(name: string): string {
  const url = assetUrls[`../assets/${name}`]
  if (!url) throw new Error(`Asset não encontrado: ${name}`)
  return url
}

function entry(raw: unknown): TemplateEntry {
  const template = parseTemplate(raw)
  const { images, audio, videos, thumbnail } = templateAssets(template)
  return { template, assets: Object.fromEntries([...images, ...audio, ...videos, ...thumbnail].map((name) => [name, assetUrl(name)])) }
}

const files = import.meta.glob('../templates/*.json', { eager: true, import: 'default' }) as Record<string, unknown>

/** Ordem de exibição; templates fora da lista aparecem depois, em ordem alfabética. */
const ORDER = [
  'depoimento-vertical',
  'depoimento-cliente',
  'dica-rapida',
  'produto-feed',
  'vaga-de-emprego',
  'convite-evento',
  'apresentacao-horizontal',
  'boas-vindas-equipe',
  'pitch-startup',
]

const rank = (id: string) => {
  const i = ORDER.indexOf(id)
  return i === -1 ? ORDER.length : i
}

/** Templates embutidos: cada arquivo em `templates/` é validado com o schema ao carregar. */
export const templates: TemplateEntry[] = Object.values(files)
  .map(entry)
  .sort((a, b) => rank(a.template.id) - rank(b.template.id) || a.template.id.localeCompare(b.template.id))

export function findTemplate(id: string): TemplateEntry | undefined {
  return templates.find((t) => t.template.id === id)
}
