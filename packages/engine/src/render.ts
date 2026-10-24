import type { Background, ImageLayer, Layer, Logo, Template, TextLayer } from '@takeslot/schema'
import { locate, videoLayout, type Segment, type Timeline } from './timeline'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type Rotation = 0 | 90 | 180 | 270

/** Frame do take ativo, já amostrado no tempo local do segmento. */
export interface FrameSource {
  image: CanvasImageSource
  /** Dimensões do frame antes da rotação. */
  width: number
  height: number
  /** Rotação em sentido horário que deve ser aplicada para exibir o frame em pé. */
  rotation?: Rotation
}

export interface SizedImage {
  image: CanvasImageSource
  width: number
  height: number
}

export interface RenderSources {
  timeline: Timeline
  /** Frame do take ou clipe ativo; `null` quando o segmento não tem vídeo ou o frame ainda não está pronto. */
  frame?: FrameSource | null
  /** Imagens do template já decodificadas, por nome do asset. */
  images: Record<string, SizedImage | undefined>
  /** Texto fixo no canto inferior direito de todos os quadros (ex.: o endereço do app). */
  watermark?: string
}

/**
 * Desenha o frame do instante `t`. É a única função de composição do projeto:
 * o preview (thread principal) e a exportação (Worker) chamam exatamente esta.
 */
export function renderFrame(ctx: Ctx2D, template: Template, t: number, sources: RenderSources): void {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  ctx.save()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)

  const located = locate(sources.timeline, t)
  if (!located) {
    ctx.restore()
    return
  }
  const { segment, local } = located

  let label = ''
  if (segment.kind === 'slot' || segment.kind === 'clip') {
    const layout = videoLayout(segment)
    label = layout.label
    ctx.fillStyle = layout.background
    ctx.fillRect(0, 0, W, H)
    if (sources.frame) drawFrame(ctx, sources.frame, layout.fit, W, H)
  } else {
    drawBackground(ctx, segment.background, W, H)
  }

  const vars = { 'template.name': template.name, 'slot.label': label }
  for (const layer of segment.layers) drawLayer(ctx, layer, local, segment.duration, W, H, sources.images, vars)

  let logoRect: Rect | null = null
  if (template.logo && (template.logo.showOn === 'all' || segment.kind === 'slot')) {
    logoRect = drawLogo(ctx, template.logo, sources.images[template.logo.asset], W, H)
  }

  const fade = transitionOpacity(template, segment, local)
  if (fade < 1) {
    ctx.globalAlpha = 1 - fade
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, H)
  }
  // Depois do escurecimento das transições: a marca fica visível o vídeo inteiro.
  if (sources.watermark) drawWatermark(ctx, sources.watermark, W, H, template.logo?.position === 'bottom-right' ? logoRect : null)
  ctx.restore()
}

/**
 * Texto branco no canto inferior direito. Se houver logo nesse canto,
 * fica logo acima dele em vez de sobrepor.
 */
function drawWatermark(ctx: Ctx2D, text: string, W: number, H: number, logo: Rect | null) {
  const m = Math.min(W, H)
  const size = Math.max(10, Math.round(m * 0.03))
  const margin = m * 0.035
  ctx.save()
  ctx.globalAlpha = 0.85
  ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
  ctx.shadowBlur = size * 0.35
  ctx.shadowOffsetY = size * 0.06
  ctx.fillStyle = '#ffffff'
  const bottom = logo ? logo.y - size * 0.5 : H - margin
  ctx.fillText(text, W - margin, bottom)
  ctx.restore()
}

/** Opacidade do conteúdo do segmento por causa da transição (1 = sem escurecer). */
export function transitionOpacity(template: Template, segment: Segment, local: number): number {
  const { type, duration } = template.transition
  if (type !== 'fade-black' || duration <= 0) return 1
  const d = Math.min(duration, segment.duration / 2)
  return clamp01(Math.min(local / d, (segment.duration - local) / d))
}

export interface LayerState {
  visible: boolean
  opacity: number
  /** Deslocamento vertical, fração da altura do canvas. */
  offsetY: number
  scale: number
}

/** Estado de uma camada no tempo local do segmento, com animação de entrada e saída. */
export function layerState(layer: Layer, local: number, segmentDuration: number): LayerState {
  const start = layer.start
  const end = layer.end === undefined ? segmentDuration : layer.end < 0 ? segmentDuration + layer.end : Math.min(layer.end, segmentDuration)
  if (local < start || local > end || end <= start) return { visible: false, opacity: 0, offsetY: 0, scale: 1 }

  const d = Math.min(layer.animationDuration, (end - start) / 2)
  // Sem animação de saída quando a camada vai até o fim do segmento: a transição já cuida disso.
  const outTo = end >= segmentDuration ? Infinity : end
  const p = d > 0 ? clamp01(Math.min((local - start) / d, (outTo - local) / d)) : 1
  const eased = easeOutCubic(p)

  switch (layer.animation) {
    case 'none':
      return { visible: true, opacity: 1, offsetY: 0, scale: 1 }
    case 'fade':
      return { visible: p > 0, opacity: eased, offsetY: 0, scale: 1 }
    case 'slide-up':
      return { visible: p > 0, opacity: eased, offsetY: (1 - eased) * 0.03, scale: 1 }
    case 'pop':
      return { visible: p > 0, opacity: eased, offsetY: 0, scale: 0.85 + 0.15 * eased }
  }
}

function drawLayer(
  ctx: Ctx2D,
  layer: Layer,
  local: number,
  segmentDuration: number,
  W: number,
  H: number,
  images: RenderSources['images'],
  vars: Record<string, string>,
) {
  const state = layerState(layer, local, segmentDuration)
  if (!state.visible || state.opacity <= 0) return
  ctx.save()
  ctx.globalAlpha = state.opacity * (layer.type === 'image' ? layer.opacity : 1)
  const cx = layer.x * W
  const cy = (layer.y + state.offsetY) * H
  if (state.scale !== 1) {
    ctx.translate(cx, cy)
    ctx.scale(state.scale, state.scale)
    ctx.translate(-cx, -cy)
  }
  if (layer.type === 'text') drawText(ctx, layer, interpolate(layer.text, vars), cx, cy, W, H)
  else drawImageLayer(ctx, layer, images[layer.asset], cx, cy, W)
  ctx.restore()
}

export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => vars[key] ?? match)
}

function drawText(ctx: Ctx2D, layer: TextLayer, text: string, x: number, y: number, W: number, H: number) {
  const size = layer.fontSize * H
  ctx.font = `${layer.fontWeight} ${size}px ${layer.fontFamily}`
  ctx.textAlign = layer.align
  ctx.textBaseline = 'middle'
  const lines = wrapText(ctx, text, layer.maxWidth * W)
  const lineHeight = size * layer.lineHeight
  const blockHeight = lineHeight * lines.length
  const top = y - blockHeight / 2

  if (layer.background) {
    const pad = layer.background.padding * H
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width))
    const left = layer.align === 'left' ? x : layer.align === 'right' ? x - width : x - width / 2
    ctx.fillStyle = layer.background.color
    roundRect(ctx, left - pad, top - pad, width + pad * 2, blockHeight + pad * 2, layer.background.radius * H)
    ctx.fill()
  }

  if (layer.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = size * 0.15
    ctx.shadowOffsetY = size * 0.04
  }
  ctx.fillStyle = layer.color
  lines.forEach((line, i) => ctx.fillText(line, x, top + lineHeight * (i + 0.5)))
}

const wrapCache = new Map<string, string[]>()

/** Quebra o texto em linhas que cabem em `maxWidth`, respeitando quebras explícitas. */
export function wrapText(ctx: Pick<Ctx2D, 'measureText' | 'font'>, text: string, maxWidth: number): string[] {
  const key = `${ctx.font}|${maxWidth}|${text}`
  const cached = wrapCache.get(key)
  if (cached) return cached

  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    lines.push(line)
  }
  if (wrapCache.size > 256) wrapCache.clear()
  wrapCache.set(key, lines)
  return lines
}

function drawImageLayer(ctx: Ctx2D, layer: ImageLayer, img: SizedImage | undefined, x: number, y: number, W: number) {
  if (!img || img.width === 0) return
  const w = layer.width * W
  const h = (w * img.height) / img.width
  const left = layer.anchor.endsWith('right') ? x - w : layer.anchor.endsWith('left') ? x : x - w / 2
  const top = layer.anchor.startsWith('bottom') ? y - h : layer.anchor.startsWith('top') ? y : y - h / 2
  ctx.drawImage(img.image, left, top, w, h)
}

function drawLogo(ctx: Ctx2D, logo: Logo, img: SizedImage | undefined, W: number, H: number): Rect | null {
  if (!img || img.width === 0) return null
  const w = logo.width * W
  const h = (w * img.height) / img.width
  const m = logo.margin * Math.min(W, H)
  const x = logo.position.endsWith('left') ? m : W - m - w
  const y = logo.position.startsWith('top') ? m : H - m - h
  ctx.save()
  ctx.globalAlpha = logo.opacity
  ctx.drawImage(img.image, x, y, w, h)
  ctx.restore()
  return { x, y, width: w, height: h }
}

function drawBackground(ctx: Ctx2D, bg: Background, W: number, H: number) {
  if (bg.type === 'color') {
    ctx.fillStyle = bg.color
  } else {
    const rad = (bg.angle * Math.PI) / 180
    const half = (Math.abs(Math.sin(rad)) * W + Math.abs(Math.cos(rad)) * H) / 2
    const dx = Math.sin(rad) * half
    const dy = Math.cos(rad) * half
    const g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy)
    g.addColorStop(0, bg.from)
    g.addColorStop(1, bg.to)
    ctx.fillStyle = g
  }
  ctx.fillRect(0, 0, W, H)
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Retângulo de destino para encaixar uma fonte `sw×sh` num canvas `W×H`. */
export function fitRect(sw: number, sh: number, W: number, H: number, fit: 'cover' | 'contain'): Rect {
  const scale = fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)
  const width = sw * scale
  const height = sh * scale
  return { x: (W - width) / 2, y: (H - height) / 2, width, height }
}

function drawFrame(ctx: Ctx2D, frame: FrameSource, fit: 'cover' | 'contain', W: number, H: number) {
  const rotation = frame.rotation ?? 0
  const sideways = rotation === 90 || rotation === 270
  const sw = sideways ? frame.height : frame.width
  const sh = sideways ? frame.width : frame.height
  if (sw === 0 || sh === 0) return
  const r = fitRect(sw, sh, W, H, fit)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  ctx.clip()
  if (rotation === 0) {
    ctx.drawImage(frame.image, r.x, r.y, r.width, r.height)
  } else {
    ctx.translate(r.x + r.width / 2, r.y + r.height / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    const dw = sideways ? r.height : r.width
    const dh = sideways ? r.width : r.height
    ctx.drawImage(frame.image, -dw / 2, -dh / 2, dw, dh)
  }
  ctx.restore()
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function easeOutCubic(p: number) {
  return 1 - Math.pow(1 - p, 3)
}
