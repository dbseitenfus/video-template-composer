import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { evaluate, type Capabilities } from '../src/composables/useCapabilities'
import { countWords, readingTime } from '../src/composables/useTeleprompter'
import { jobIdFor } from '../src/composables/useExport'
import { formatBytes, formatDuration } from '../src/lib/format'
import { findTemplate } from '@takeslot/templates'
import { loadCatalog, parseCatalog } from '../src/lib/catalog'

vi.mock('../src/lib/opfs', () => ({
  exists: vi.fn(async (path: string) => !path.includes('perdido')),
  removeEntry: vi.fn(async () => {}),
  readFile: vi.fn(async () => null),
}))

const { useProjectStore } = await import('../src/stores/project')
const opfs = await import('../src/lib/opfs')

const full: Capabilities = {
  webCodecs: true,
  h264: true,
  aac: true,
  opus: true,
  opfs: true,
  offscreenCanvas: true,
  camera: true,
  mediaRecorder: true,
  recorderMimeType: 'video/mp4',
  wakeLock: true,
  shareFiles: true,
  saveFilePicker: false,
}

describe('evaluate (capacidades)', () => {
  it('aceita um navegador completo', () => {
    expect(evaluate(full)).toMatchObject({ supported: true, blockers: [] })
  })

  it('bloqueia sem WebCodecs (Firefox Android)', () => {
    const r = evaluate({ ...full, webCodecs: false, h264: false, aac: false, opus: false })
    expect(r.supported).toBe(false)
    expect(r.blockers[0]).toContain('WebCodecs')
  })

  it('avisa sobre Opus quando falta AAC', () => {
    const r = evaluate({ ...full, aac: false })
    expect(r.supported).toBe(true)
    expect(r.warnings.join()).toContain('Opus')
  })

  it('bloqueia sem OPFS', () => {
    expect(evaluate({ ...full, opfs: false }).supported).toBe(false)
  })
})

describe('project store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const take = (slotId: string, path: string, duration = 6) => ({
    id: path,
    slotId,
    path,
    mimeType: 'video/mp4',
    duration,
    size: 1,
    createdAt: 0,
    thumbnail: null,
  })

  it('seleciona template e acompanha os slots gravados', async () => {
    const store = useProjectStore()
    await store.selectTemplate(findTemplate('depoimento-vertical')!)
    expect(store.template?.slots).toHaveLength(3)
    expect(store.nextEmptySlot?.id).toBe('apresentacao')
    await store.saveTake(take('apresentacao', 'takes/1.mp4'))
    expect(store.recordedCount).toBe(1)
    expect(store.nextEmptySlot?.id).toBe('desafio')
    expect(store.allRecorded).toBe(false)
  })

  it('regravar apaga o arquivo anterior', async () => {
    const store = useProjectStore()
    await store.selectTemplate(findTemplate('depoimento-vertical')!)
    await store.saveTake(take('apresentacao', 'takes/1.mp4'))
    await store.saveTake(take('apresentacao', 'takes/2.mp4'))
    expect(opfs.removeEntry).toHaveBeenCalledWith('takes/1.mp4')
    expect(store.takes.apresentacao?.path).toBe('takes/2.mp4')
  })

  it('marca take curto demais', async () => {
    const store = useProjectStore()
    await store.selectTemplate(findTemplate('depoimento-vertical')!)
    await store.saveTake(take('apresentacao', 'takes/1.mp4', 1))
    expect(store.slotStatus('apresentacao')).toBe('too-short')
  })

  it('trocar de template limpa os takes', async () => {
    const store = useProjectStore()
    await store.selectTemplate(findTemplate('depoimento-vertical')!)
    await store.saveTake(take('apresentacao', 'takes/1.mp4'))
    await store.selectTemplate(findTemplate('apresentacao-horizontal')!)
    expect(store.takes).toEqual({})
    expect(opfs.removeEntry).toHaveBeenCalledWith('takes/1.mp4')
  })

  it('descarta metadados de arquivos que sumiram', async () => {
    const store = useProjectStore()
    await store.selectTemplate(findTemplate('depoimento-vertical')!)
    await store.saveTake(take('apresentacao', 'takes/ok.mp4'))
    await store.saveTake(take('desafio', 'takes/perdido.mp4'))
    expect(await store.verifyTakes()).toEqual(['desafio'])
    expect(Object.keys(store.takes)).toEqual(['apresentacao'])
  })

  it('versão nova do mesmo template apaga os takes; a mesma versão mantém', async () => {
    const store = useProjectStore()
    const v1 = { ...findTemplate('depoimento-vertical')!, version: 1 }
    await store.selectTemplate(v1)
    await store.saveTake(take('apresentacao', 'takes/1.mp4'))
    await store.selectTemplate(v1)
    expect(store.recordedCount).toBe(1)
    await store.selectTemplate({ ...v1, version: 2 })
    expect(store.recordedCount).toBe(0)
  })

  it('persiste só metadados no localStorage', async () => {
    const store = useProjectStore()
    await store.selectTemplate(findTemplate('depoimento-vertical')!)
    await store.saveTake(take('apresentacao', 'takes/1.mp4'))
    await Promise.resolve()
    const saved = JSON.parse(localStorage.getItem('takeslot:project')!)
    expect(saved.entry.template.id).toBe('depoimento-vertical')
    expect(saved.takes.apresentacao.path).toBe('takes/1.mp4')
  })
})

describe('utilitários', () => {
  it('jobIdFor não depende da ordem dos takes', () => {
    expect(jobIdFor('x', ['b', 'a'])).toBe(jobIdFor('x', ['a', 'b']))
    expect(jobIdFor('x', ['a'])).not.toBe(jobIdFor('x', ['c']))
  })

  it('tempo de leitura e contagem de palavras', () => {
    expect(countWords(' um  dois\ntrês ')).toBe(3)
    expect(readingTime('a b c d', 120)).toBe(2)
  })

  it('formatação', () => {
    expect(formatDuration(65.4)).toBe('1:05')
    expect(formatBytes(1536)).toBe('2 KB')
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB')
  })
})

describe('catálogo', () => {
  const api = (body: unknown, ok = true) =>
    (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch

  beforeEach(() => localStorage.clear())

  it('usa os templates publicados e descarta os inválidos', async () => {
    const valid = findTemplate('apresentacao-horizontal')!
    const catalog = await loadCatalog(api({ templates: [{ ...valid, version: 3 }, { template: { id: 'quebrado' }, assets: {} }] }))
    expect(catalog.source).toBe('api')
    expect(catalog.entries.map((e) => [e.template.id, e.version])).toEqual([['apresentacao-horizontal', 3]])
  })

  it('sem rede, usa o cache; sem cache, os embutidos', async () => {
    const valid = findTemplate('apresentacao-horizontal')!
    await loadCatalog(api({ templates: [{ ...valid, version: 1 }] }))
    const offline = (async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch
    expect((await loadCatalog(offline)).source).toBe('cache')
    localStorage.clear()
    const fallback = await loadCatalog(offline)
    expect(fallback.source).toBe('bundled')
    expect(fallback.entries.length).toBeGreaterThan(0)
  })

  it('nada publicado ainda: mostra os embutidos', async () => {
    expect((await loadCatalog(api({ templates: [] }))).source).toBe('bundled')
    expect(parseCatalog(null)).toEqual([])
  })
})
