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
 *   --dry-run   só confere (e converte, se preciso) os arquivos e mostra o que seria criado;
 *               não envia nada e não precisa de token
 *   --rascunho  salva os modelos sem publicar
 *
 * Vídeos que não estejam em H.264/AAC (ex.: HEVC) são convertidos com o ffmpeg, se estiver
 * instalado, para a subpasta `convertidos/`. Os arquivos originais não são alterados.
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
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

const run = promisify(execFile)
const hasFfmpeg = await run('ffmpeg', ['-version']).then(() => true, () => false)
const isCompatible = (info) => info.codec === 'avc' && (!info.audioCodec || info.audioCodec === 'aac')

/**
 * Garante um arquivo em H.264/AAC: devolve o original se já estiver no formato,
 * senão converte (uma vez) para `convertidos/` mantendo a resolução.
 */
async function ensureCompatible(path, name) {
  const info = await probe(path)
  if (isCompatible(info)) return { path, info, converted: false }
  if (!hasFfmpeg) throw new Error(`${name} está em ${info.codec}/${info.audioCodec}: instale o ffmpeg ou envie pelo admin, que converte`)
  const outDir = join(dir, 'convertidos')
  const out = join(outDir, name.replace(/\.[^.]+$/, '') + '.mp4')
  const [src, done] = await Promise.all([stat(path), stat(out).catch(() => null)])
  if (!done || done.mtimeMs < src.mtimeMs) {
    await mkdir(outDir, { recursive: true })
    process.stdout.write(`  convertendo ${name} (${info.codec} → H.264)… `)
    const audio = info.audioCodec === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k']
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', ...audio, '-movflags', '+faststart', out])
    console.log('ok')
  }
  const convertedInfo = await probe(out)
  if (!isCompatible(convertedInfo)) throw new Error(`a conversão de ${name} não gerou H.264/AAC`)
  return { path: out, info: convertedInfo, converted: true }
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
    ...(coverKey ? { thumbnail: coverKey } : {}),
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
const missingCovers = []
for (const [n, item] of manifest.videos.entries()) {
  const label = `[${n + 1}/${manifest.videos.length}] ${item.title}`
  const videoPath = join(dir, item.video)
  const coverPath = join(dir, item.cover)
  try {
    const [vs, cs] = await Promise.all([stat(videoPath).catch(() => null), stat(coverPath).catch(() => null)])
    if (!vs) throw new Error(`falta o arquivo ${item.video}`)
    const ready = await ensureCompatible(videoPath, item.video)
    const info = ready.info
    const size = (await stat(ready.path)).size
    if (size > MAX_BYTES) throw new Error(`${item.video} tem ${(size / 1048576).toFixed(0)} MB (máximo 95 MB)`)
    const summary = `${info.width}×${info.height}, ${info.duration.toFixed(1)} s, ${(size / 1048576).toFixed(1)} MB${ready.converted ? ', convertido para H.264' : ''}`
    // Sem a capa, o modelo é criado mesmo assim e a miniatura vira um quadro do vídeo.
    // Rodar de novo depois de baixar a capa atualiza o modelo.
    const coverNote = cs ? '' : ` · sem capa (${item.cover}): a miniatura será um quadro do vídeo`
    if (!cs) missingCovers.push(item.cover)
    if (dryRun) {
      console.log(`${label}: ok (${summary})${coverNote}`)
      ok++
      continue
    }
    console.log(`${label}: enviando (${summary})${coverNote}…`)
    const videoKey = await upload(ready.path, item.video, 'video/mp4', info)
    const coverKey = cs ? await upload(coverPath, item.cover, 'image/jpeg') : undefined
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
if (missingCovers.length) {
  console.log(`${missingCovers.length} sem capa (a miniatura será um quadro do vídeo). Baixe as capas e rode de novo para usar as do site.`)
}
if (problems.length) {
  console.log('Pendências:\n' + problems.map((p) => `- ${p}`).join('\n'))
  process.exitCode = 1
}
