#!/usr/bin/env node
/*
 * Cria a versão "com pausas" de um modelo publicado: o vídeo pronto é dividido em
 * partes e, entre elas, a pessoa grava um comentário curto.
 *
 *   abertura gravada → parte 1 → comentário 1 → parte 2 → comentário 2 → … → encerramento
 *
 * As partes reaproveitam o mesmo arquivo já enviado (só mudam início e duração), então
 * não há upload. Os cortes caem nas trocas de cena mais próximas de partes iguais, para
 * não cortar no meio de uma imagem; para isso o script lê o arquivo local do vídeo com o ffmpeg.
 *
 * Uso (na raiz do repositório; o token é pedido no terminal se ADMIN_TOKEN não existir):
 *   node apps/web/scripts/create-pause-template.mjs --from campanha-5-perguntas --pausas 2 --url https://gravai.pages.dev
 *
 * Opções:
 *   --pausas N     quantos comentários no meio do vídeo (padrão 2 → 3 partes)
 *   --cortes a,b   pontos de corte em segundos, em vez de detectar trocas de cena
 *   --dry-run      só mostra o modelo que seria criado
 */
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const fromId = opt('from')
const pauses = Math.max(1, Math.min(5, Number(opt('pausas', '2')) || 2))
const manualCuts = opt('cortes')
const baseUrl = opt('url', 'https://gravai.pages.dev').replace(/\/$/, '')
const manifestPath = opt('manifest', 'apps/web/scripts/campanha/manifest.json')
const dir = opt('dir', 'apps/web/scripts/campanha/arquivos')
const dryRun = flag('dry-run')
const run = promisify(execFile)

if (!fromId) {
  console.error('Informe o modelo de origem: --from <id> (ex.: campanha-5-perguntas)')
  process.exit(1)
}

/** Pede o token no terminal sem mostrar o que é digitado. */
async function askToken() {
  if (!process.stdin.isTTY) return ''
  process.stdout.write('Token do admin (não aparece na tela): ')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  let value = ''
  return new Promise((resolve) => {
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off('data', onData)
          process.stdout.write('\n')
          return resolve(value.trim())
        }
        if (ch === '\u0003') process.exit(130)
        if (ch === '\u007f') value = value.slice(0, -1)
        else value += ch
      }
    }
    process.stdin.on('data', onData)
  })
}

/** Trocas de cena do arquivo (segundos), detectadas pelo ffmpeg. */
async function sceneChanges(path) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-vf', "select='gt(scene,0.3)',showinfo", '-an', '-f', 'null', '-'], {
    maxBuffer: 64 * 1024 * 1024,
  })
  return [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1]))
}

/** Escolhe, para cada divisão igual, a troca de cena mais próxima (até 30% de uma parte de distância). */
export function chooseCuts(start, length, parts, scenes) {
  const step = length / parts
  const cuts = []
  for (let k = 1; k < parts; k++) {
    const target = start + step * k
    const near = scenes
      .filter((s) => s > start + 3 && s < start + length - 3 && Math.abs(s - target) <= step * 0.3)
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0]
    cuts.push(Math.round((near ?? target) * 100) / 100)
  }
  return cuts
}

const res = await fetch(`${baseUrl}/api/templates`)
const source = (await res.json()).templates.find((e) => e.template.id === fromId)?.template
if (!source) {
  console.error(`Modelo "${fromId}" não encontrado entre os publicados em ${baseUrl}.`)
  process.exit(1)
}
const clip = source.clips[0]
if (!clip) {
  console.error(`O modelo "${fromId}" não tem vídeo pronto para dividir.`)
  process.exit(1)
}

let cuts
if (manualCuts) {
  cuts = manualCuts.split(',').map(Number).filter((n) => n > clip.trimStart && n < clip.trimStart + clip.duration).sort((a, b) => a - b)
} else {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const item = manifest.videos.find((v) => v.id === fromId)
  const candidates = item ? [join(dir, 'convertidos', item.video), join(dir, item.video)] : []
  const local = (await Promise.all(candidates.map((p) => stat(p).then(() => p, () => null)))).find(Boolean)
  const scenes = local ? await sceneChanges(local) : []
  if (!local) console.warn('Arquivo local do vídeo não encontrado: cortes em partes iguais (use --cortes para escolher).')
  cuts = chooseCuts(clip.trimStart, clip.duration, pauses + 1, scenes)
}

const bounds = [clip.trimStart, ...cuts, clip.trimStart + clip.duration]
const parts = bounds.slice(0, -1).map((start, i) => ({ start, end: bounds[i + 1] }))
const first = source.slots[0]

const template = {
  ...source,
  id: `${source.id}-pausas`.slice(0, 64),
  name: `${source.name} (com comentários)`,
  description: `O vídeo para ${parts.length - 1 === 1 ? 'uma vez' : `${parts.length - 1} vezes`} para você comentar com suas palavras.`,
  slots: [
    {
      ...(first ?? {}),
      id: 'abertura',
      label: 'Abertura',
      // Mesmo início do modelo de origem (roteiro próprio de cada vídeo), avisando das pausas.
      script: `${first?.script ?? `Para tudo e assiste esse vídeo: "${source.name}".`}\nE no meio eu paro pra dizer o que eu penso.`,
      minDuration: 3,
      maxDuration: 15,
      fit: 'cover',
      background: '#000000',
      layers: [],
    },
    ...parts.slice(1).map((_, i) => ({
      id: `comentario-${i + 1}`,
      label: `Comentário ${i + 1}`,
      // Antes de gravar, o app mostra a parte do vídeo que vem antes deste comentário;
      // o roteiro se refere a ela sem supor que a pessoa está vendo o vídeo agora.
      script:
        i === 0
          ? 'Viu isso? Diz com as suas palavras o que mais te incomodou nesse trecho.\nUma ou duas frases bastam: o que vale é ser você falando.'
          : 'E agora, o que você acha disso?\nFala do coração e termina pedindo pra assistirem até o fim.',
      minDuration: 3,
      maxDuration: 20,
      fit: 'cover',
      background: '#000000',
      layers: [],
    })),
  ],
  // Parte 1 depois da abertura; parte k depois do comentário k-1.
  clips: parts.map((p, i) => ({
    ...clip,
    id: `parte-${i + 1}`,
    label: `${clip.label} · parte ${i + 1}`,
    after: i === 0 ? 'abertura' : `comentario-${i}`,
    trimStart: Math.round(p.start * 100) / 100,
    duration: Math.round((p.end - p.start) * 100) / 100,
  })),
}

/** Mesma regra de ordem do app: cada slot seguido dos clipes com `after` igual ao id dele. */
function sequence(t) {
  const out = t.clips.filter((c) => c.after === 'intro').map((c) => c.id)
  for (const s of t.slots) out.push(s.id, ...t.clips.filter((c) => c.after === s.id).map((c) => c.id))
  return out
}

console.log(`Origem: ${source.name} (${clip.duration.toFixed(1)} s de vídeo)`)
parts.forEach((p, i) => console.log(`  parte ${i + 1}: ${p.start.toFixed(2)}–${p.end.toFixed(2)} s (${(p.end - p.start).toFixed(1)} s)`))
console.log(`Sequência: ${[template.intro ? 'abertura (cartão)' : null, ...sequence(template), template.outro ? 'encerramento' : null].filter(Boolean).join(' → ')}`)
if (dryRun) process.exit(0)

const token = process.env.ADMIN_TOKEN || (await askToken())
if (!token) {
  console.error('Sem token: defina ADMIN_TOKEN ou rode num terminal para digitar o token.')
  process.exit(1)
}
async function api(path, init = {}) {
  const r = await fetch(`${baseUrl}/api/admin${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } })
  const body = await r.json().catch(() => null)
  if (!r.ok) {
    const e = new Error(`${body?.error ?? r.status}${Array.isArray(body?.details) ? ` (${body.details.map((d) => `${d.path}: ${d.message}`).join('; ')})` : ''}`)
    e.status = r.status
    throw e
  }
  return body
}
try {
  await api('/templates', { method: 'POST', body: JSON.stringify(template) })
} catch (e) {
  if (e.status !== 409) throw e
  await api(`/templates/${encodeURIComponent(template.id)}`, { method: 'PUT', body: JSON.stringify({ template }) })
}
const { version } = await api(`/templates/${encodeURIComponent(template.id)}/publish`, { method: 'POST' })
console.log(`Publicado: ${template.id} v${version}`)
