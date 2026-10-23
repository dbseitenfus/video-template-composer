/*
 * Telemetria de erros anônima. Só envia se VITE_TELEMETRY_URL estiver definido;
 * nunca inclui conteúdo dos vídeos, nomes ou roteiros — só o erro e o ambiente.
 */
const endpoint = import.meta.env.VITE_TELEMETRY_URL as string | undefined

export function reportError(error: unknown, context: Record<string, string | number | boolean> = {}): void {
  const e = error instanceof Error ? error : new Error(String(error))
  console.error(e, context)
  if (!endpoint) return
  const body = JSON.stringify({
    name: e.name,
    message: e.message.slice(0, 500),
    stack: e.stack?.split('\n').slice(0, 8).join('\n'),
    context,
    ua: navigator.userAgent,
    at: new Date().toISOString(),
  })
  try {
    navigator.sendBeacon?.(endpoint, body) || void fetch(endpoint, { method: 'POST', body, keepalive: true })
  } catch {
    // Telemetria nunca derruba o app.
  }
}
