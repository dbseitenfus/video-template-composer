import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny'
import type { AssetKind } from './api'

export interface PreparedUpload {
  file: Blob
  name: string
  kind: AssetKind
  width?: number
  height?: number
  duration?: number
  /** O vídeo foi convertido para H.264/AAC no navegador antes do upload. */
  converted: boolean
}

const IMAGE_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']
const AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/aac']

export function kindOf(file: File): AssetKind | null {
  if (IMAGE_TYPES.includes(file.type)) return 'image'
  if (AUDIO_TYPES.includes(file.type)) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function audioDuration(file: Blob): Promise<number | undefined> {
  try {
    const ctx = new OfflineAudioContext(1, 1, 48000)
    return (await ctx.decodeAudioData(await file.arrayBuffer())).duration
  } catch {
    return undefined
  }
}

/**
 * Prepara um arquivo para a biblioteca. Vídeos que não estejam em MP4 H.264/AAC são
 * convertidos aqui, no navegador do admin: o app só aceita esse formato porque é o único
 * que decodifica em todos os navegadores-alvo.
 */
export async function prepareUpload(file: File, onProgress?: (p: number) => void): Promise<PreparedUpload> {
  const kind = kindOf(file)
  if (!kind) throw new Error(`Formato não suportado: ${file.type || file.name}`)
  if (kind === 'image') return { file, name: file.name, kind, ...(await imageSize(file)), converted: false }
  if (kind === 'audio') return { file, name: file.name, kind, duration: await audioDuration(file), converted: false }

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error('O arquivo não tem vídeo')
    const audio = await input.getPrimaryAudioTrack()
    const duration = (await input.computeDuration()) - (await input.getFirstTimestamp())
    const meta = { width: video.displayWidth, height: video.displayHeight, duration }
    const ok = file.type === 'video/mp4' && video.codec === 'avc' && (!audio || audio.codec === 'aac') && video.rotation === 0
    if (ok) return { file, name: file.name, kind, ...meta, converted: false }

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
    const conversion = await Conversion.init({
      input,
      output,
      video: { codec: 'avc', bitrate: 6_000_000, forceTranscode: video.codec !== 'avc' },
      audio: { codec: 'aac', bitrate: 160_000 },
    })
    if (!conversion.isValid) throw new Error('Não foi possível converter este vídeo para H.264/AAC neste navegador')
    conversion.onProgress = (p) => onProgress?.(p)
    await conversion.execute()
    const name = file.name.replace(/\.[^.]+$/, '') + '.mp4'
    return { file: new Blob([output.target.buffer!], { type: 'video/mp4' }), name, kind, ...meta, converted: true }
  } finally {
    input.dispose()
  }
}
