import { buildTimeline, renderFrame, type FrameSource, type SizedImage } from '@takeslot/engine'
import { templateAssets, type Template } from '@takeslot/schema'
import { templates } from '@takeslot/templates'

/** Duração usada para trechos ainda não gravados (a mesma regra do preview do admin). */
const placeholderDuration = (s: Template['slots'][number]) => Math.min(s.maxDuration, Math.max(s.minDuration, 6))

function placeholder(label: string, width: number, height: number): FrameSource {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  // Gradiente imitando uma pessoa em frente à câmera, para avaliar contraste dos textos.
  const g = ctx.createLinearGradient(0, 0, 0, height)
  g.addColorStop(0, '#5b6b7d')
  g.addColorStop(1, '#2b2f36')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#c9a98c'
  ctx.beginPath()
  ctx.ellipse(width / 2, height * 0.42, Math.min(width, height) * 0.16, Math.min(width, height) * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3d4a5c'
  ctx.beginPath()
  ctx.ellipse(width / 2, height * 0.95, Math.min(width, height) * 0.38, height * 0.3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `600 ${Math.round(Math.min(width, height) * 0.04)}px system-ui`
  ctx.textAlign = 'center'
  ctx.fillText(`[gravação: ${label}]`, width / 2, height * 0.66)
  return { image: c, width, height }
}

async function loadImage(url: string): Promise<SizedImage> {
  const img = new Image()
  img.src = url
  await img.decode()
  return { image: img, width: img.naturalWidth, height: img.naturalHeight }
}

async function videoFrame(url: string, time: number): Promise<FrameSource> {
  const v = document.createElement('video')
  v.muted = true
  v.preload = 'auto'
  v.src = url
  await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }))
  v.currentTime = time
  await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
  return { image: v, width: v.videoWidth, height: v.videoHeight }
}

async function renderTemplate({ template, assets }: (typeof templates)[number]) {
  const durations = Object.fromEntries(template.slots.map((s) => [s.id, placeholderDuration(s)]))
  const timeline = buildTimeline(template, durations)
  const images: Record<string, SizedImage> = {}
  for (const name of templateAssets(template).images) images[name] = await loadImage(assets[name]!)

  const section = document.createElement('section')
  section.dataset.template = template.id
  const fmt = `${template.canvas.width}×${template.canvas.height}`
  section.innerHTML = `<h2>${template.name} <small>${template.id} · ${fmt} · ${timeline.duration.toFixed(1)} s com durações de exemplo</small></h2>`
  const strip = document.createElement('div')
  strip.className = 'strip'
  section.append(strip)
  document.getElementById('gallery')!.append(section)

  const scale = 480 / Math.max(template.canvas.width, template.canvas.height)
  const width = Math.round(template.canvas.width * scale)
  const height = Math.round(template.canvas.height * scale)

  for (const segment of timeline.segments) {
    const local = Math.min(1.2, segment.duration / 2)
    const t = segment.start + local
    let frame: FrameSource | null = null
    let caption = ''
    if (segment.kind === 'slot') {
      frame = placeholder(segment.slot.label, width, height)
      caption = `Trecho: ${segment.slot.label}`
    } else if (segment.kind === 'clip') {
      frame = await videoFrame(assets[segment.clip.asset]!, segment.clip.trimStart + local)
      caption = `Vídeo pronto: ${segment.clip.label}`
    } else {
      caption = segment.kind === 'intro' ? 'Abertura' : 'Encerramento'
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    renderFrame(canvas.getContext('2d')!, template, t, { timeline, frame, images })
    const fig = document.createElement('figure')
    fig.append(canvas)
    const cap = document.createElement('figcaption')
    cap.textContent = caption
    fig.append(cap)
    strip.append(fig)
  }
}

for (const entry of templates) await renderTemplate(entry)
document.body.dataset.ready = 'true'
