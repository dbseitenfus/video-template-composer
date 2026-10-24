import { z } from 'zod'

// Mensagens de validação em português (aparecem no admin).
z.config(z.locales.pt())

/**
 * Schema do template. Todas as posições e tamanhos são normalizados (0–1)
 * em relação ao canvas, então o mesmo template rende em 720p ou 1080p.
 */

export const ColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'cor deve ser hexadecimal (#rgb, #rrggbb ou #rrggbbaa)')

const unit = z.number().min(0).max(1)
const seconds = z.number().min(0)

export const AnimationSchema = z.enum(['none', 'fade', 'slide-up', 'pop'])

const LayerTimingSchema = z.object({
  /** Início relativo ao começo do segmento, em segundos. */
  start: seconds.default(0),
  /** Fim relativo ao começo do segmento; ausente = até o fim. Negativo = segundos antes do fim. */
  end: z.number().optional(),
  animation: AnimationSchema.default('fade'),
  animationDuration: seconds.default(0.4),
})

export const TextLayerSchema = LayerTimingSchema.extend({
  type: z.literal('text'),
  /** Aceita `{{slot.label}}` e `{{template.name}}`. */
  text: z.string().min(1),
  x: unit,
  y: unit,
  align: z.enum(['left', 'center', 'right']).default('center'),
  /** Largura máxima da caixa de texto, fração da largura do canvas. */
  maxWidth: unit.default(0.9),
  /** Tamanho da fonte, fração da altura do canvas. */
  fontSize: z.number().positive().max(0.5).default(0.05),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]).default(700),
  fontFamily: z.string().default('system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'),
  lineHeight: z.number().positive().default(1.2),
  color: ColorSchema.default('#ffffff'),
  background: z
    .object({
      color: ColorSchema,
      /** Padding como fração da altura do canvas. */
      padding: unit.default(0.012),
      radius: unit.default(0.008),
    })
    .optional(),
  shadow: z.boolean().default(true),
})

export const ImageLayerSchema = LayerTimingSchema.extend({
  type: z.literal('image'),
  /** Nome do arquivo em `assets` do pacote de templates. */
  asset: z.string().min(1),
  x: unit,
  y: unit,
  /** Largura como fração da largura do canvas; a altura segue a proporção da imagem. */
  width: unit,
  anchor: z.enum(['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']).default('center'),
  opacity: unit.default(1),
})

export const LayerSchema = z.discriminatedUnion('type', [TextLayerSchema, ImageLayerSchema])

export const BackgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('color'), color: ColorSchema }),
  z.object({
    type: z.literal('gradient'),
    from: ColorSchema,
    to: ColorSchema,
    /** Ângulo em graus; 0 = de cima para baixo. */
    angle: z.number().default(0),
  }),
])

export const CardSchema = z.object({
  duration: z.number().positive().max(15),
  background: BackgroundSchema,
  layers: z.array(LayerSchema).default([]),
})

export const SlotSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'id do slot deve ter só letras minúsculas, números e hífen'),
    label: z.string().min(1),
    /** Roteiro exibido no teleprompter. */
    script: z.string().min(1),
    minDuration: seconds.default(2),
    maxDuration: z.number().positive().max(120),
    fit: z.enum(['cover', 'contain']).default('cover'),
    /** Fundo usado quando `fit = contain` deixa bordas. */
    background: ColorSchema.default('#000000'),
    layers: z.array(LayerSchema).default([]),
  })
  .refine((s) => s.minDuration < s.maxDuration, { message: 'minDuration deve ser menor que maxDuration' })

/**
 * Vídeo fixo do template (vinheta, trecho institucional) que entra entre os trechos gravados.
 * Precisa ser MP4 H.264/AAC para decodificar em todos os navegadores-alvo.
 */
export const ClipSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id do clipe deve ter só letras minúsculas, números e hífen'),
  label: z.string().min(1),
  /** Nome do arquivo em `assets` do pacote de templates. */
  asset: z.string().min(1),
  /** Onde o clipe entra: `intro` (logo após a abertura) ou o id do slot que vem antes dele. */
  after: z.string().min(1),
  /** Ponto de início dentro do arquivo, em segundos. */
  trimStart: seconds.default(0),
  /** Duração usada do clipe, em segundos (declarada para a linha do tempo não depender de ler o arquivo). */
  duration: z.number().positive().max(600),
  fit: z.enum(['cover', 'contain']).default('cover'),
  background: ColorSchema.default('#000000'),
  /** Volume do áudio do clipe (0 = mudo). */
  volume: unit.default(1),
  /** Abaixa a trilha enquanto o clipe toca, como numa fala. */
  duckMusic: z.boolean().default(true),
  layers: z.array(LayerSchema).default([]),
})

export const LogoSchema = z.object({
  asset: z.string().min(1),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).default('top-right'),
  /** Largura como fração da largura do canvas. */
  width: unit.default(0.18),
  /** Margem como fração do menor lado do canvas. */
  margin: unit.default(0.04),
  opacity: unit.default(0.9),
  showOn: z.enum(['all', 'slots']).default('slots'),
})

export const MusicSchema = z.object({
  asset: z.string().min(1),
  /** Volume da trilha em abertura e encerramento. */
  volume: unit.default(0.6),
  /** Volume da trilha enquanto alguém fala (ducking). */
  duckedVolume: unit.default(0.12),
  /** Tempo de rampa do ducking, em segundos. */
  duckRamp: seconds.default(0.35),
  fadeIn: seconds.default(1),
  fadeOut: seconds.default(1.5),
  loop: z.boolean().default(true),
})

export const TransitionSchema = z.object({
  type: z.enum(['cut', 'fade-black']).default('fade-black'),
  duration: seconds.max(2).default(0.3),
})

export const AudioSettingsSchema = z.object({
  /** Nível RMS alvo das falas, em dBFS. */
  targetRmsDb: z.number().max(0).default(-20),
  /** Ganho máximo aplicado na normalização, em dB. */
  maxGainDb: z.number().min(0).max(24).default(12),
})

export const TemplateSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    description: z.string().default(''),
    /** Imagem de capa do modelo na página inicial (asset). Sem ela, a capa é desenhada a partir do vídeo. */
    thumbnail: z.string().min(1).optional(),
    /** Tamanho de referência; a exportação escala mantendo a proporção. */
    canvas: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30)]).default(30),
    /** Resoluções permitidas (lado menor, em pixels). */
    resolutions: z
      .array(z.union([z.literal(720), z.literal(1080)]))
      .min(1)
      .default([1080, 720]),
    intro: CardSchema.optional(),
    slots: z.array(SlotSchema).min(1),
    clips: z.array(ClipSchema).default([]),
    outro: CardSchema.optional(),
    logo: LogoSchema.optional(),
    music: MusicSchema.optional(),
    transition: TransitionSchema.default({ type: 'fade-black', duration: 0.3 }),
    audio: AudioSettingsSchema.default({ targetRmsDb: -20, maxGainDb: 12 }),
  })
  .superRefine((t, ctx) => {
    const ids = new Set<string>()
    t.slots.forEach((slot, i) => {
      if (ids.has(slot.id)) {
        ctx.addIssue({ code: 'custom', path: ['slots', i, 'id'], message: `slot duplicado: ${slot.id}` })
      }
      ids.add(slot.id)
    })
    t.clips.forEach((clip, i) => {
      if (ids.has(clip.id)) {
        ctx.addIssue({ code: 'custom', path: ['clips', i, 'id'], message: `id repetido: ${clip.id}` })
      }
      ids.add(clip.id)
      if (clip.after !== 'intro' && !t.slots.some((s) => s.id === clip.after)) {
        ctx.addIssue({ code: 'custom', path: ['clips', i, 'after'], message: `"after" deve ser "intro" ou o id de um slot: ${clip.after}` })
      }
    })
  })

export type Color = z.infer<typeof ColorSchema>
export type Animation = z.infer<typeof AnimationSchema>
export type TextLayer = z.infer<typeof TextLayerSchema>
export type ImageLayer = z.infer<typeof ImageLayerSchema>
export type Layer = z.infer<typeof LayerSchema>
export type Background = z.infer<typeof BackgroundSchema>
export type Card = z.infer<typeof CardSchema>
export type Slot = z.infer<typeof SlotSchema>
export type Clip = z.infer<typeof ClipSchema>
export type Logo = z.infer<typeof LogoSchema>
export type Music = z.infer<typeof MusicSchema>
export type Transition = z.infer<typeof TransitionSchema>
export type Template = z.infer<typeof TemplateSchema>
/** Formato aceito na entrada (campos com default são opcionais). */
export type TemplateInput = z.input<typeof TemplateSchema>
export type Resolution = Template['resolutions'][number]

export function parseTemplate(data: unknown): Template {
  return TemplateSchema.parse(data)
}

export function safeParseTemplate(data: unknown) {
  return TemplateSchema.safeParse(data)
}

/** Lista os assets referenciados pelo template (logo, imagens, trilha, clipes e capa). */
export function templateAssets(template: Template): { images: string[]; audio: string[]; videos: string[]; thumbnail: string[] } {
  const images = new Set<string>()
  const collect = (layers: Layer[]) => {
    for (const layer of layers) if (layer.type === 'image') images.add(layer.asset)
  }
  if (template.intro) collect(template.intro.layers)
  if (template.outro) collect(template.outro.layers)
  for (const slot of template.slots) collect(slot.layers)
  for (const clip of template.clips) collect(clip.layers)
  if (template.logo) images.add(template.logo.asset)
  return {
    images: [...images],
    audio: template.music ? [template.music.asset] : [],
    videos: [...new Set(template.clips.map((c) => c.asset))],
    // Separada das imagens do vídeo: a capa só aparece na página inicial, não é desenhada nos quadros.
    thumbnail: template.thumbnail ? [template.thumbnail] : [],
  }
}

/** Dimensões de saída para uma resolução (lado menor), sempre pares para o H.264. */
export function outputSize(template: Template, resolution: Resolution): { width: number; height: number } {
  const { width, height } = template.canvas
  const scale = resolution / Math.min(width, height)
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2)
  return { width: even(width), height: even(height) }
}
export * from './sequence'
