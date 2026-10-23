export interface Env {
  DB: D1Database
  ASSETS_BUCKET: R2Bucket
  /** Token do admin (segredo do Pages / .dev.vars). */
  ADMIN_TOKEN?: string
}
