import { onScopeDispose, ref } from 'vue'

/** Mantém a tela ligada enquanto `request()` estiver ativo; readquire ao voltar para a aba. */
export function useWakeLock() {
  const active = ref(false)
  let sentinel: WakeLockSentinel | null = null
  let wanted = false

  async function acquire() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      active.value = true
      sentinel.addEventListener('release', () => (active.value = false))
    } catch {
      active.value = false
    }
  }

  function onVisibility() {
    if (wanted && document.visibilityState === 'visible' && !active.value) void acquire()
  }

  async function request() {
    wanted = true
    document.addEventListener('visibilitychange', onVisibility)
    await acquire()
  }

  async function release() {
    wanted = false
    document.removeEventListener('visibilitychange', onVisibility)
    await sentinel?.release().catch(() => {})
    sentinel = null
    active.value = false
  }

  onScopeDispose(() => void release())
  return { active, request, release }
}
