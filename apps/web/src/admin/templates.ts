import type { Card, Clip, Layer, Slot, Template, TextLayer } from '@takeslot/schema'

/** Utilitários do editor: modelos de itens novos e conversões de assets. */

export const ASPECTS = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
} as const

export type Aspect = keyof typeof ASPECTS

export function aspectOf(t: Pick<Template, 'canvas'>): Aspect | null {
  const entry = Object.entries(ASPECTS).find(([, s]) => s.width === t.canvas.width && s.height === t.canvas.height)
  return (entry?.[0] as Aspect) ?? null
}

export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'item'
  )
}

/** Id único a partir de um texto, sem colidir com os ids existentes. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const slug = slugify(base)
  if (!used.has(slug)) return slug
  for (let i = 2; ; i++) if (!used.has(`${slug}-${i}`)) return `${slug}-${i}`
}

export function usedIds(t: Pick<Template, 'slots' | 'clips'>): string[] {
  return [...t.slots.map((s) => s.id), ...t.clips.map((c) => c.id)]
}

export function textLayer(text = 'Novo texto', overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    type: 'text',
    text,
    x: 0.5,
    y: 0.85,
    align: 'center',
    maxWidth: 0.9,
    fontSize: 0.04,
    fontWeight: 700,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    lineHeight: 1.2,
    color: '#ffffff',
    shadow: true,
    start: 0,
    animation: 'fade',
    animationDuration: 0.4,
    ...overrides,
  }
}

export function newSlot(t: Template, label = 'Novo trecho'): Slot {
  return {
    id: uniqueId(label, usedIds(t)),
    label,
    script: 'Escreva aqui o roteiro que aparece no teleprompter.',
    minDuration: 3,
    maxDuration: 20,
    fit: 'cover',
    background: '#000000',
    layers: [],
  }
}

export function newClip(t: Template, asset: { key: string; name: string; duration: number | null }): Clip {
  const label = asset.name.replace(/\.[^.]+$/, '')
  return {
    id: uniqueId(label, usedIds(t)),
    label,
    asset: asset.key,
    after: 'intro',
    trimStart: 0,
    duration: Math.min(120, Math.max(0.5, Math.round((asset.duration ?? 5) * 100) / 100)),
    fit: 'cover',
    background: '#000000',
    volume: 1,
    duckMusic: true,
    layers: [],
  }
}

export function newCard(title = 'Título'): Card {
  return { duration: 3, background: { type: 'color', color: '#1b1b3a' }, layers: [textLayer(title, { y: 0.5, fontSize: 0.06 })] }
}

export function newTemplate(id: string, name: string, aspect: Aspect): Template {
  const base: Template = {
    schemaVersion: 1,
    id,
    name,
    description: '',
    canvas: { ...ASPECTS[aspect] },
    fps: 30,
    resolutions: [1080, 720],
    intro: newCard(name),
    slots: [],
    clips: [],
    outro: undefined,
    transition: { type: 'fade-black', duration: 0.3 },
    audio: { targetRmsDb: -20, maxGainDb: 12 },
  }
  base.slots.push(newSlot(base, 'Apresentação'))
  return base
}

/** Troca nomes de assets (ex.: arquivos embutidos → chaves no R2). */
export function remapAssets(t: Template, map: Record<string, string>): Template {
  const swap = (name: string) => map[name] ?? name
  const layers = (ls: Layer[]) => ls.map((l) => (l.type === 'image' ? { ...l, asset: swap(l.asset) } : l))
  return {
    ...t,
    intro: t.intro && { ...t.intro, layers: layers(t.intro.layers) },
    outro: t.outro && { ...t.outro, layers: layers(t.outro.layers) },
    slots: t.slots.map((s) => ({ ...s, layers: layers(s.layers) })),
    clips: t.clips.map((c) => ({ ...c, asset: swap(c.asset), layers: layers(c.layers) })),
    logo: t.logo && { ...t.logo, asset: swap(t.logo.asset) },
    music: t.music && { ...t.music, asset: swap(t.music.asset) },
  }
}

/** Duração usada no preview do admin para um trecho que o usuário ainda vai gravar. */
export function placeholderDuration(slot: Slot): number {
  return Math.min(slot.maxDuration, Math.max(slot.minDuration, 6))
}

/** Rótulos amigáveis para caminhos de erro do schema. */
export function describePath(t: Template, path: string): string {
  const [head, index, ...rest] = path.split('.')
  if (head === 'slots' && index !== undefined) return `Trecho “${t.slots[Number(index)]?.label ?? index}”${rest.length ? ` · ${rest.join('.')}` : ''}`
  if (head === 'clips' && index !== undefined) return `Vídeo “${t.clips[Number(index)]?.label ?? index}”${rest.length ? ` · ${rest.join('.')}` : ''}`
  const names: Record<string, string> = { intro: 'Abertura', outro: 'Encerramento', logo: 'Logo', music: 'Trilha', name: 'Nome', canvas: 'Formato' }
  return [names[head ?? ''] ?? head, index, ...rest].filter(Boolean).join(' · ')
}
