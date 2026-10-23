import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { evaluate, type Capabilities } from '../src/composables/useCapabilities'
import { countWords, readingTime } from '../src/composables/useTeleprompter'
import { jobIdFor } from '../src/composables/useExport'
import { formatBytes, formatDuration } from '../src/lib/format'

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
    await store.selectTemplate('depoimento-vertical')
    expect(store.template?.slots).toHaveLength(3)
    expect(store.nextEmptySlot?.id).toBe('apresentacao')
    await store.saveTake(take('apresentacao', 'takes/1.mp4'))
    expect(store.recordedCount).toBe(1)
    expect(store.nextEmptySlot?.id).toBe('desafio')
    expect(store.allRecorded).toBe(false)
  })

  it('regravar apaga o arquivo anterior', async () => {
    const store = useProjectStore()
    await store.selectTemplate('depoimento-vertical')
    await store.saveTake(take('apresentacao', 'takes/1.mp4'))
    await store.saveTake(take('apresentacao', 'takes/2.mp4'))
    expect(opfs.removeEntry).toHaveBeenCalledWith('takes/1.mp4')
    expect(store.takes.apresentacao?.path).toBe('takes/2.mp4')
  })

  it('marca take curto demais', async () => {
    const store = useProjectStore()
    await store.selectTemplate('depoimento-vertical')
    await store.saveTake(take('apresentacao', 'takes/1.mp4', 1))
    expect(store.slotStatus('apresentacao')).toBe('too-short')
  })

  it('trocar de template limpa os takes', async () => {
    const store = useProjectStore()
    await store.selectTemplate('depoimento-vertical')
    await store.saveTake(take('apresentacao', 'takes/1.mp4'))
    await store.selectTemplate('apresentacao-horizontal')
    expect(store.takes).toEqual({})
    expect(opfs.removeEntry).toHaveBeenCalledWith('takes/1.mp4')
  })

  it('descarta metadados de arquivos que sumiram', async () => {
    const store = useProjectStore()
    await store.selectTemplate('depoimento-vertical')
    await store.saveTake(take('apresentacao', 'takes/ok.mp4'))
    await store.saveTake(take('desafio', 'takes/perdido.mp4'))
    expect(await store.verifyTakes()).toEqual(['desafio'])
    expect(Object.keys(store.takes)).toEqual(['apresentacao'])
  })

  it('persiste só metadados no localStorage', async () => {
    const store = useProjectStore()
    await store.selectTemplate('depoimento-vertical')
    await store.saveTake(take('apresentacao', 'takes/1.mp4'))
    await Promise.resolve()
    const saved = JSON.parse(localStorage.getItem('takeslot:project')!)
    expect(saved.templateId).toBe('depoimento-vertical')
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
