// Gera assets/vinheta-marca.mp4 (4 s, 1080×1920, H.264 + AAC): um clipe de exemplo
// para o template vertical. Codifica no Chrome com WebCodecs + Mediabunny, via Playwright.
// Uso: node packages/templates/scripts/gen-clip.mjs  (requer o Google Chrome instalado)
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const bundle = readFileSync(fileURLToPath(import.meta.resolve('mediabunny').replace(/dist\/modules\/src\/index\.js$/, 'dist/bundles/mediabunny.min.mjs')))
const server = createServer((req, res) => {
  if (req.url === '/mediabunny.mjs') {
    res.writeHead(200, { 'content-type': 'text/javascript' })
    res.end(bundle)
  } else {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>gen</title>')
  }
}).listen(0)
const port = server.address().port

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.goto(`http://localhost:${port}/`)
const base64 = await page.evaluate(async () => {
  const mb = await import('/mediabunny.mjs')
  const W = 1080, H = 1920, fps = 30, seconds = 4
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d')
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() })
  const video = new mb.CanvasSource(canvas, { codec: 'avc', bitrate: 2_500_000 })
  output.addVideoTrack(video, { frameRate: fps })
  const audio = new mb.AudioSampleSource({ codec: 'aac', bitrate: 128_000 })
  output.addAudioTrack(audio)
  await output.start()

  const ease = (p) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3)
  for (let n = 0; n < seconds * fps; n++) {
    const t = n / fps
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, '#ff5a36')
    g.addColorStop(1, '#1b1b3a')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    // círculos concêntricos se expandindo
    for (let i = 0; i < 6; i++) {
      const r = ((t * 260 + i * 220) % 1320)
      ctx.strokeStyle = `rgba(255,255,255,${0.18 * (1 - r / 1320)})`
      ctx.lineWidth = 18
      ctx.beginPath()
      ctx.arc(W / 2, H * 0.42, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    // selo com o "play" entrando com escala
    const s = 0.6 + 0.4 * ease(t / 0.8)
    ctx.save()
    ctx.translate(W / 2, H * 0.42)
    ctx.scale(s, s)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(-170, -170, 340, 340, 80)
    ctx.fill()
    ctx.fillStyle = '#ff5a36'
    ctx.beginPath()
    ctx.moveTo(-55, -95)
    ctx.lineTo(105, 0)
    ctx.lineTo(-55, 95)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    // texto subindo
    const p = ease((t - 0.6) / 0.6)
    ctx.globalAlpha = p
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 92px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Vinheta de exemplo', W / 2, H * 0.62 + (1 - p) * 60)
    ctx.font = '500 52px system-ui, sans-serif'
    ctx.fillText('troque por um vídeo da sua marca', W / 2, H * 0.62 + 90 + (1 - p) * 60)
    ctx.globalAlpha = 1
    await video.add(t, 1 / fps)
  }

  // acorde curto com ataque suave
  const sr = 48000
  const data = new Float32Array(sr * seconds * 2)
  const notes = [523.25, 659.25, 783.99, 1046.5]
  for (let i = 0; i < sr * seconds; i++) {
    const t = i / sr
    const env = Math.min(1, t / 0.05) * Math.exp(-t * 1.1)
    let v = 0
    notes.forEach((f, k) => (v += Math.sin(2 * Math.PI * f * t + k) * (t > k * 0.12 ? 1 : 0)))
    data[i] = data[i + sr * seconds] = 0.12 * env * v
  }
  const sample = new mb.AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: sr, timestamp: 0 })
  await audio.add(sample)
  sample.close()
  await output.finalize()
  const bytes = new Uint8Array(output.target.buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
})
await browser.close()
server.close()
writeFileSync(fileURLToPath(new URL('../assets/vinheta-marca.mp4', import.meta.url)), Buffer.from(base64, 'base64'))
console.log('assets/vinheta-marca.mp4 gerado')
