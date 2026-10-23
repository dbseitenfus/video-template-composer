import * as Comlink from 'comlink'
import { buildTimeline, decodeAudioUrl, decodeTakeAudio, loadImageBitmaps, mixAudio, type ExportJob } from '@takeslot/engine'
import { outputSize, templateAssets, type Resolution } from '@takeslot/schema'
import { templates } from '@takeslot/templates'
import type { BenchWorkerApi } from './bench.worker'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const templateSelect = $<HTMLSelectElement>('template')
const status = $<HTMLParagraphElement>('status')
const results = $<HTMLTableSectionElement>('results')
const startButton = $<HTMLButtonElement>('start')

for (const { template } of templates) templateSelect.add(new Option(template.name, template.id))

$('env').textContent = [
  `UA: ${navigator.userAgent}`,
  `Núcleos: ${navigator.hardwareConcurrency ?? '?'} · Memória do aparelho: ${(navigator as { deviceMemory?: number }).deviceMemory ?? '?'} GB`,
  `Tela: ${screen.width}×${screen.height} @${devicePixelRatio}x`,
].join('\n')

const worker = Comlink.wrap<BenchWorkerApi>(new Worker(new URL('./bench.worker.ts', import.meta.url), { type: 'module' }))

/** Distribui a duração pedida entre os slots, respeitando o máximo de cada um. */
function takeDurations(entry: (typeof templates)[number], total: number): Record<string, number> {
  const t = entry.template
  let remaining = Math.max(t.slots.length * 2, total - (t.intro?.duration ?? 0) - (t.outro?.duration ?? 0))
  const out: Record<string, number> = {}
  t.slots.forEach((slot, i) => {
    const share = remaining / (t.slots.length - i)
    out[slot.id] = Math.min(slot.maxDuration, Math.max(2, Math.round(share)))
    remaining -= out[slot.id]!
  })
  return out
}

function memoryMb(): string {
  const m = (performance as { memory?: { usedJSHeapSize: number } }).memory
  return m ? `${(m.usedJSHeapSize / 1024 ** 2).toFixed(0)} MB` : 'n/d'
}

async function run() {
  startButton.disabled = true
  results.innerHTML = ''
  try {
    const entry = templates.find((t) => t.template.id === templateSelect.value)!
    const { template } = entry
    const resolution = Number($<HTMLSelectElement>('resolution').value) as Resolution
    const runs = Math.max(1, Math.min(10, Number($<HTMLInputElement>('runs').value)))
    const durations = takeDurations(entry, Number($<HTMLInputElement>('duration').value))
    const timeline = buildTimeline(template, durations)
    const { width, height } = outputSize(template, resolution)

    status.textContent = 'Gerando takes sintéticos (não entra na medição)…'
    const takePaths = Object.fromEntries(template.slots.map((s) => [s.id, `takes/${s.id}-${durations[s.id]}s-${width}x${height}.mp4`]))
    await worker.generateTakes(template.slots.map((s) => ({ path: takePaths[s.id]!, seconds: durations[s.id]! })), width, height)

    let passed = 0
    for (let i = 1; i <= runs; i++) {
      status.textContent = `Exportação ${i}/${runs}: preparando áudio…`
      const t0 = performance.now()
      const takeAudio: Record<string, AudioBuffer | null> = {}
      for (const slot of template.slots) {
        const bytes = await worker.readFile(takePaths[slot.id]!)
        takeAudio[slot.id] = bytes ? await decodeTakeAudio(new Blob([bytes as Uint8Array<ArrayBuffer>])) : null
      }
      const music = template.music ? await decodeAudioUrl(entry.assets[template.music.asset]!) : null
      const audio = await mixAudio({ template, timeline, takes: takeAudio, music })
      const images = await loadImageBitmaps(Object.fromEntries(templateAssets(template).images.map((n) => [n, entry.assets[n]!])))

      const job: ExportJob = { id: `bench-${i}`, template, takeDurations: durations, takePaths, resolution, images, audio }
      let row: HTMLTableRowElement | null = null
      try {
        const result = await worker.run(
          Comlink.transfer(job, [...Object.values(images), ...audio.channels.map((c) => c.buffer as ArrayBuffer)]),
          Comlink.proxy((p) => {
            status.textContent = `Exportação ${i}/${runs}: ${p.phase} ${(p.fraction * 100).toFixed(0)}% · ${p.speed.toFixed(2)}×`
          }),
        )
        const elapsed = (performance.now() - t0) / 1000
        // Gate da fase 0 normalizado: 60 s de vídeo em até 120 s, ou seja, velocidade ≥ 0,5×.
        const ok = elapsed <= timeline.duration * 2
        if (ok) passed++
        row = results.insertRow()
        row.innerHTML = `<td>${i}</td><td>${elapsed.toFixed(1)} s</td><td>${(timeline.duration / elapsed).toFixed(2)}×</td><td>${(result.size / 1024 ** 2).toFixed(1)} MB</td><td>${memoryMb()}</td><td class="${ok ? 'pass' : 'fail'}">${ok ? 'passou' : 'não passou'}</td>`
      } catch (e) {
        row = results.insertRow()
        row.innerHTML = `<td>${i}</td><td colspan="5" class="fail">Falhou: ${(e as Error).message}</td>`
      }
    }
    status.textContent = `${passed}/${runs} exportações dentro do gate · vídeo de ${timeline.duration.toFixed(1)} s em ${width}×${height}`
  } catch (e) {
    status.textContent = `Erro: ${(e as Error).message}`
  } finally {
    startButton.disabled = false
  }
}

startButton.addEventListener('click', () => void run())
