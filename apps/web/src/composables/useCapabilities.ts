import { shallowRef } from 'vue'
import { canEncodeAudio, canEncodeVideo } from 'mediabunny'
import { isOpfsAvailable } from '../lib/opfs'
import { pickRecorderMimeType } from '../lib/media'

export interface Capabilities {
  webCodecs: boolean
  h264: boolean
  aac: boolean
  opus: boolean
  opfs: boolean
  offscreenCanvas: boolean
  camera: boolean
  mediaRecorder: boolean
  recorderMimeType: string | null
  wakeLock: boolean
  shareFiles: boolean
  saveFilePicker: boolean
}

export interface CapabilityReport {
  caps: Capabilities
  /** Motivos que impedem usar o app neste navegador. */
  blockers: string[]
  /** Avisos que não impedem o uso. */
  warnings: string[]
  supported: boolean
}

const safe = async (fn: () => Promise<boolean> | boolean) => {
  try {
    return await fn()
  } catch {
    return false
  }
}

export async function detectCapabilities(): Promise<Capabilities> {
  const webCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined' && typeof AudioEncoder !== 'undefined'
  const [h264, aac, opus, opfs] = await Promise.all([
    safe(() => webCodecs && canEncodeVideo('avc', { width: 1280, height: 720 })),
    safe(() => webCodecs && canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000 })),
    safe(() => webCodecs && canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000 })),
    isOpfsAvailable(),
  ])
  const shareFiles = await safe(
    () => typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'video.mp4', { type: 'video/mp4' })] }),
  )
  return {
    webCodecs,
    h264,
    aac,
    opus,
    opfs,
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    camera: !!navigator.mediaDevices?.getUserMedia,
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    recorderMimeType: pickRecorderMimeType(),
    wakeLock: 'wakeLock' in navigator,
    shareFiles,
    saveFilePicker: 'showSaveFilePicker' in window,
  }
}

export function evaluate(caps: Capabilities): CapabilityReport {
  const blockers: string[] = []
  const warnings: string[] = []
  if (!caps.webCodecs) blockers.push('Este navegador não tem WebCodecs, necessário para montar o vídeo no aparelho.')
  else if (!caps.h264) blockers.push('Este aparelho não consegue codificar vídeo H.264.')
  if (caps.webCodecs && !caps.aac && !caps.opus) blockers.push('Este navegador não codifica áudio AAC nem Opus.')
  if (!caps.opfs) blockers.push('O armazenamento local (OPFS) está indisponível. Em janelas anônimas ele costuma ficar bloqueado.')
  if (!caps.offscreenCanvas) blockers.push('Este navegador não suporta OffscreenCanvas.')
  if (!caps.camera) blockers.push('Não há acesso à câmera neste contexto (a página precisa estar em HTTPS).')
  if (!caps.mediaRecorder || !caps.recorderMimeType) blockers.push('Este navegador não grava vídeo com MediaRecorder.')

  if (caps.webCodecs && !caps.aac && caps.opus) warnings.push('Sem AAC neste navegador: o áudio sai em Opus, que alguns apps antigos não tocam.')
  if (!caps.wakeLock) warnings.push('Mantenha a tela ligada durante a exportação.')
  return { caps, blockers, warnings, supported: blockers.length === 0 }
}

const report = shallowRef<CapabilityReport | null>(null)
let pending: Promise<CapabilityReport> | null = null

/** Checagem feita uma vez por sessão, antes de qualquer gravação. */
export function useCapabilities() {
  async function check(): Promise<CapabilityReport> {
    pending ??= detectCapabilities().then(evaluate)
    report.value = await pending
    return report.value
  }
  return { report, check }
}
