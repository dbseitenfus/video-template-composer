import type { Env } from '../../_lib/env'
import { bearer, error, sameToken } from '../../_lib/http'

/** Toda rota em /api/admin exige o token do admin. */
export const onRequest: PagesFunction<Env> = async ({ env, request, next }) => {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 16) return error(503, 'ADMIN_TOKEN não configurado (mínimo de 16 caracteres)')
  const token = bearer(request)
  if (!token || !(await sameToken(token, env.ADMIN_TOKEN))) return error(401, 'Token inválido')
  return next()
}
