/**
 * Rasteriza as imagens do template na thread principal. SVG não decodifica
 * dentro de Workers, então o Worker recebe ImageBitmaps prontos (transferíveis).
 */
export async function loadImageBitmap(url: string, maxSide = 1024): Promise<ImageBitmap> {
  const img = new Image()
  img.decoding = 'async'
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const w = img.naturalWidth || 512
  const h = img.naturalHeight || 512
  const scale = maxSide / Math.max(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return createImageBitmap(canvas)
}

export async function loadImageBitmaps(urls: Record<string, string>): Promise<Record<string, ImageBitmap>> {
  const entries = await Promise.all(Object.entries(urls).map(async ([name, url]) => [name, await loadImageBitmap(url)] as const))
  return Object.fromEntries(entries)
}
