import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'

/**
 * Duração do take. WebM do MediaRecorder não traz duração nos metadados,
 * então a duração é calculada pelos pacotes.
 */
export async function probeDuration(file: Blob): Promise<number> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error('O arquivo gravado não tem vídeo')
    const first = await video.getFirstTimestamp()
    return (await video.computeDuration()) - first
  } finally {
    input.dispose()
  }
}

/** Formatos do MediaRecorder em ordem de preferência: MP4/H.264 primeiro, WebM depois. */
export const RECORDER_MIME_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return RECORDER_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

export function extensionFor(mimeType: string): string {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
}

/** Miniatura JPEG pequena a partir de um elemento de vídeo (guardada nos metadados do take). */
export function captureThumbnail(video: HTMLVideoElement, width = 160): string | null {
  if (!video.videoWidth) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.round((width * video.videoHeight) / video.videoWidth)
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  try {
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    return null
  }
}
