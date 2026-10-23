import { parseTemplate, templateAssets, type Template } from '@takeslot/schema'
import depoimentoVertical from '../templates/depoimento-vertical.json'
import apresentacaoHorizontal from '../templates/apresentacao-horizontal.json'

const assetUrls = import.meta.glob('../assets/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export interface TemplateEntry {
  template: Template
  /** URL de cada asset referenciado, por nome do arquivo. */
  assets: Record<string, string>
}

function assetUrl(name: string): string {
  const url = assetUrls[`../assets/${name}`]
  if (!url) throw new Error(`Asset não encontrado: ${name}`)
  return url
}

function entry(raw: unknown): TemplateEntry {
  const template = parseTemplate(raw)
  const { images, audio } = templateAssets(template)
  return { template, assets: Object.fromEntries([...images, ...audio].map((name) => [name, assetUrl(name)])) }
}

export const templates: TemplateEntry[] = [entry(depoimentoVertical), entry(apresentacaoHorizontal)]

export function findTemplate(id: string): TemplateEntry | undefined {
  return templates.find((t) => t.template.id === id)
}
