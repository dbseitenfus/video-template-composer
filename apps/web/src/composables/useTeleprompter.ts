import { computed, onScopeDispose, ref, type Ref } from 'vue'

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/** Tempo estimado de leitura do roteiro, em segundos. */
export function readingTime(text: string, wordsPerMinute: number): number {
  return (countWords(text) / wordsPerMinute) * 60
}

/**
 * Rolagem do roteiro por velocidade de leitura (palavras por minuto).
 * A velocidade em px/s é derivada da altura do texto e do número de palavras.
 */
export function useTeleprompter(container: Ref<HTMLElement | null>, script: Ref<string>) {
  const wordsPerMinute = ref(140)
  const playing = ref(false)
  const progress = ref(0)
  let raf = 0
  let last = 0

  const duration = computed(() => readingTime(script.value, wordsPerMinute.value))

  function frame(now: number) {
    const el = container.value
    if (!el || !playing.value) return
    const dt = (now - last) / 1000
    last = now
    const scrollable = el.scrollHeight - el.clientHeight
    if (scrollable > 0 && duration.value > 0) {
      el.scrollTop = Math.min(scrollable, el.scrollTop + (scrollable / duration.value) * dt)
      progress.value = el.scrollTop / scrollable
      if (el.scrollTop >= scrollable) {
        playing.value = false
        return
      }
    }
    raf = requestAnimationFrame(frame)
  }

  function play() {
    if (playing.value) return
    playing.value = true
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  function pause() {
    playing.value = false
    cancelAnimationFrame(raf)
  }

  function reset() {
    pause()
    progress.value = 0
    if (container.value) container.value.scrollTop = 0
  }

  function adjustSpeed(delta: number) {
    wordsPerMinute.value = Math.min(260, Math.max(60, wordsPerMinute.value + delta))
  }

  onScopeDispose(pause)
  return { wordsPerMinute, playing, progress, duration, play, pause, reset, adjustSpeed }
}
