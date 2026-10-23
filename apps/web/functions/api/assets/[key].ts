import type { Env } from '../../_lib/env'

/**
 * Serve arquivos do R2 com suporte a Range (o <video> do preview pede pedaços).
 * As chaves são derivadas do conteúdo, então o cache pode ser eterno.
 */
export const onRequestGet: PagesFunction<Env, 'key'> = async ({ env, params, request }) => {
  const key = String(params.key)
  const object = await env.ASSETS_BUCKET.get(key, { range: request.headers, onlyIf: request.headers })
  if (!object) return new Response('Não encontrado', { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'public, max-age=31536000, immutable')

  if (!('body' in object) || !object.body) return new Response(null, { status: 304, headers })

  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined
  if (range && request.headers.has('range')) {
    const offset = range.offset ?? (range.suffix !== undefined ? object.size - range.suffix : 0)
    const length = range.length ?? object.size - offset
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`)
    headers.set('content-length', String(length))
    return new Response(object.body, { status: 206, headers })
  }
  headers.set('content-length', String(object.size))
  return new Response(object.body, { headers })
}
