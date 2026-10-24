#!/usr/bin/env node
/*
 * Importa vídeos prontos como modelos do gravaí: um modelo por vídeo.
 *
 * Cada modelo tem: um trecho curto gravado pela pessoa ("Seu recado"), o vídeo inteiro
 * e um encerramento com o endereço para compartilhar e o crédito do vídeo. A capa do
 * modelo na página inicial é a imagem indicada no manifesto.
 *
 * Uso (na raiz do repositório):
 *   ADMIN_TOKEN=... node apps/web/scripts/import-videos.mjs \
 *     --manifest apps/web/scripts/campanha/manifest.json \
 *     --dir apps/web/scripts/campanha/arquivos \
 *     --url https://gravai.pages.dev
 *
 * Opções:
 *   --dry-run   só confere os arquivos e mostra o que seria criado (não precisa de token)
 *   --rascunho  salva os modelos sem publicar
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const manifestPath = opt('manifest', 'apps/web/scripts/campanha/manifest.json')
const dir = opt('dir', 'apps/web/scripts/campanha/arquivos')
const baseUrl = opt('url', 'https://gravai.pages.dev').replace(/\/$/, '')
const dryRun = flag('dry-run')
const publish = !flag('rascunho')
const token = process.env.ADMIN_TOKEN
const MAX_BYTES = 95 * 1024 * 1024
const CANVAS = { width: 1080, height: 1920 }

if (!dryRun && !token) {
  console.error('Defina ADMIN_TOKEN (o token do admin) ou use --dry-run.')
  process.exit(1)
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

async function probe(path) {
  const input = new Input({ source: new FilePathSource(path), formats: ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error('arquivo sem vídeo')
    const audio = await input.getPrimaryAudioTrack()
    const duration = (await input.computeDuration()) - (await input.getFirstTimestamp())
    return { codec: video.codec, audioCodec: audio?.codec ?? null, width: video.displayWidth, height: video.displayHeight, duration }
  } finally {
    input.dispose()
  }
}

async function api(path, init = {}) {
  const headers = { authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  const res = await fetch(`${baseUrl}/api/admin${path}`, { ...init, headers })
  const body = (res.headers.get('content-type') ?? '').includes('application/json') ? await res.json() : null
  if (!res.ok) {
    const details = Array.isArray(body?.details) ? ` (${body.details.map((d) => `${d.path}: ${d.message}`).join('; ')})` : ''
    const err = new Error(`${init.method ?? 'GET'} ${path}: ${body?.error ?? res.status}${details}`)
    err.status = res.status
    throw err
  }
  return body
}

async function upload(path, name, type, meta = {}) {
  const data = await readFile(path)
  const headers = { 'content-type': type, 'x-file-name': encodeURIComponent(name) }
  if (meta.width) headers['x-width'] = String(meta.width)
  if (meta.height) headers['x-height'] = String(meta.height)
  if (meta.duration) headers['x-duration'] = String(meta.duration)
  return (await api('/assets', { method: 'POST', body: data, headers })).asset.key
}

function buildTemplate(item, videoKey, coverKey, info) {
  const sourceAspect = info.width / info.height
  const targetAspect = CANVAS.width / CANVAS.height
  // Proporção parecida com 9:16: preenche a tela. Muito diferente: mostra inteiro, com faixas.
  const fit = Math.abs(sourceAspect - targetAspect) / targetAspect < 0.12 ? 'cover' : 'contain'
  return {
    schemaVersion: 1,
    id: item.id,
    name: item.title,
    description: 'Grave um recado curto e compartilhe este vídeo da campanha.',
    thumbnail: coverKey,
    canvas: CANVAS,
    fps: 30,
    resolutions: [1080, 720],
    slots: [
      {
        id: 'recado',
        label: 'Seu recado',
        script: `Oi! Separei um vídeo que todo mundo precisa ver: "${item.title}".\nAssista até o fim e compartilhe com quem ainda está em dúvida.`,
        minDuration: 3,
        maxDuration: 20,
        fit: 'cover',
        layers: [],
      },
    ],
    clips: [
      {
        id: 'video',
        label: item.title,
        asset: videoKey,
        after: 'recado',
        trimStart: 0,
        duration: Math.min(600, Math.floor(info.duration * 100) / 100),
        fit,
        background: '#000000',
        volume: 1,
        duckMusic: true,
        layers: [],
      },
    ],
    outro: {
      duration: 3,
      // Fundo azul: a marca branca do gravaí (canto inferior direito) continua visível.
      background: { type: 'color', color: '#002776' },
      layers: [
        { type: 'text', text: 'Veja e compartilhe', x: 0.5, y: 0.42, fontSize: 0.05, fontWeight: 800, color: '#ffffff', shadow: false, animation: 'pop' },
        { type: 'text', text: manifest.shareUrl, x: 0.5, y: 0.49, fontSize: 0.035, fontWeight: 700, color: '#ffdf00', shadow: false, start: 0.3 },
        { type: 'text', text: manifest.credit, x: 0.5, y: 0.85, maxWidth: 0.86, fontSize: 0.018, fontWeight: 500, color: '#c8d3ee', shadow: false, start: 0.3 },
      ],
    },
    transition: { type: 'fade-black', duration: 0.2 },
  }
}

let ok = 0
const problems = []
for (const [n, item] of manifest.videos.entries()) {
  const label = `[${n + 1}/${manifest.videos.length}] ${item.title}`
  const videoPath = join(dir, item.video)
  const coverPath = join(dir, item.cover)
  try {
    const [vs, cs] = await Promise.all([stat(videoPath).catch(() => null), stat(coverPath).catch(() => null)])
    if (!vs) throw new Error(`falta o arquivo ${item.video}`)
    if (!cs) throw new Error(`falta a capa ${item.cover}`)
    if (vs.size > MAX_BYTES) throw new Error(`${item.video} tem ${(vs.size / 1048576).toFixed(0)} MB (máximo 95 MB): envie pelo admin, que converte`)
    const info = await probe(videoPath)
    if (info.codec !== 'avc' || (info.audioCodec && info.audioCodec !== 'aac')) {
      throw new Error(`${item.video} está em ${info.codec}/${info.audioCodec}: envie pelo admin, que converte para H.264/AAC`)
    }
    const summary = `${info.width}×${info.height}, ${info.duration.toFixed(1)} s, ${(vs.size / 1048576).toFixed(1)} MB`
    if (dryRun) {
      console.log(`${label}: ok (${summary}) → ${item.id}`)
      ok++
      continue
    }
    console.log(`${label}: enviando (${summary})…`)
    const videoKey = await upload(videoPath, item.video, 'video/mp4', info)
    const coverKey = await upload(coverPath, item.cover, 'image/jpeg')
    const template = buildTemplate(item, videoKey, coverKey, info)
    try {
      await api('/templates', { method: 'POST', body: JSON.stringify(template), headers: { 'content-type': 'application/json' } })
    } catch (e) {
      if (e.status !== 409) throw e
      await api(`/templates/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify({ template }), headers: { 'content-type': 'application/json' } })
    }
    if (publish) {
      const { version } = await api(`/templates/${encodeURIComponent(item.id)}/publish`, { method: 'POST' })
      console.log(`  publicado: ${item.id} v${version}`)
    } else {
      console.log(`  rascunho salvo: ${item.id}`)
    }
    ok++
  } catch (e) {
    problems.push(`${label}: ${e.message}`)
    console.error(`${label}: ERRO: ${e.message}`)
  }
}

console.log(`\n${ok} de ${manifest.videos.length} ${dryRun ? 'conferidos' : publish ? 'publicados' : 'salvos'}.`)
if (problems.length) {
  console.log('Pendências:\n' + problems.map((p) => `- ${p}`).join('\n'))
  process.exitCode = 1
}
