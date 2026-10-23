import { onScopeDispose, ref, shallowRef } from 'vue'

export type Facing = 'user' | 'environment'

export type CameraError = 'denied' | 'not-found' | 'in-use' | 'unknown'

function classify(e: unknown): CameraError {
  const name = (e as DOMException)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'not-found'
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use'
  return 'unknown'
}

/** Câmera e microfone. O MediaStream fica em shallowRef: nunca dentro de um proxy reativo. */
export function useCamera() {
  const stream = shallowRef<MediaStream | null>(null)
  const facing = ref<Facing>('user')
  const error = ref<CameraError | null>(null)
  const starting = ref(false)

  function stop() {
    stream.value?.getTracks().forEach((t) => t.stop())
    stream.value = null
  }

  /**
   * Abre a câmera na orientação nativa do aparelho (paisagem no computador, retrato no celular em pé).
   * Nunca pedimos o formato do template: o navegador recortaria e ampliaria a imagem para caber
   * (crop-and-scale), o que vira um zoom enorme numa webcam. O enquadramento final é feito
   * depois, com `fit` do slot, e a moldura na tela mostra o que vai entrar no vídeo.
   */
  async function start(nextFacing: Facing = facing.value) {
    stop()
    starting.value = true
    error.value = null
    const portrait = window.matchMedia?.('(orientation: portrait)').matches ?? false
    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacing,
          width: { ideal: portrait ? 1080 : 1920 },
          height: { ideal: portrait ? 1920 : 1080 },
          frameRate: { ideal: 30, max: 30 },
          resizeMode: 'none',
        } as MediaTrackConstraints,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      facing.value = nextFacing
    } catch (e) {
      error.value = classify(e)
    } finally {
      starting.value = false
    }
  }

  async function switchCamera() {
    await start(facing.value === 'user' ? 'environment' : 'user')
  }

  onScopeDispose(stop)
  return { stream, facing, error, starting, start, stop, switchCamera }
}
