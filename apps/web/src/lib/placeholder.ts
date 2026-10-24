import type { FrameSource } from '@takeslot/engine'

const cache = new Map<string, FrameSource>()

/** Silhueta de uma pessoa em frente à câmera, usada nas miniaturas no lugar da gravação. */
export function personPlaceholder(width: number, height: number): FrameSource {
  const key = `${width}x${height}`
  const cached = cache.get(key)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  const m = Math.min(width, height)
  const g = ctx.createLinearGradient(0, 0, 0, height)
  g.addColorStop(0, '#4a5568')
  g.addColorStop(1, '#232733')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#c9a98c'
  ctx.beginPath()
  ctx.ellipse(width / 2, height * 0.44, m * 0.17, m * 0.21, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e11d2e'
  ctx.beginPath()
  ctx.ellipse(width / 2, height * 0.98, m * 0.42, height * 0.3, 0, 0, Math.PI * 2)
  ctx.fill()
  const frame = { image: c, width, height }
  cache.set(key, frame)
  return frame
}
