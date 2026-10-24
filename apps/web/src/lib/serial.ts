/**
 * Fila global: executa as tarefas uma de cada vez, na ordem de chegada.
 * Usada para decodificar um vídeo por vez nas miniaturas: vários decodificadores
 * abertos ao mesmo tempo (vários cards visíveis de uma vez) às vezes travavam sem erro.
 */
let queue: Promise<unknown> = Promise.resolve()

export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => {})
  return run
}

/** Resolve com `fallback` se a promessa não terminar em `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}
