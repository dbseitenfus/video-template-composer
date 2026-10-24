import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { parseTemplate, templateSequence } from '@takeslot/schema'
import SlotList from '../src/components/SlotList.vue'
import Teleprompter from '../src/components/Teleprompter.vue'
import UnsupportedNotice from '../src/components/UnsupportedNotice.vue'
import type { TakeMeta } from '../src/stores/project'

const template = parseTemplate({
  schemaVersion: 1,
  id: 't',
  name: 'T',
  canvas: { width: 1080, height: 1920 },
  slots: [
    { id: 'a', label: 'Abertura', script: 'Oi', minDuration: 3, maxDuration: 10 },
    { id: 'b', label: 'Fechamento', script: 'Tchau', maxDuration: 10 },
  ],
  clips: [{ id: 'v', label: 'Vídeo da campanha', asset: 'v.mp4', after: 'a', duration: 30 }],
})
const items = templateSequence(template)

const take = (slotId: string, duration: number): TakeMeta => ({
  id: slotId,
  slotId,
  path: `takes/${slotId}.mp4`,
  mimeType: 'video/mp4',
  duration,
  size: 1000,
  createdAt: 0,
  thumbnail: null,
})

describe('SlotList', () => {
  it('mostra status e emite ações', async () => {
    const takes = { a: take('a', 2) }
    const wrapper = mount(SlotList, {
      props: { items, takes, status: (id: string) => (id === 'a' ? 'too-short' : 'empty') },
    })
    const rows = wrapper.findAll('li')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.classes()).toContain('too-short')
    expect(rows[0]!.text()).toContain('curto demais')
    // o vídeo pronto aparece entre os trechos, na posição em que entra
    expect(rows[1]!.classes()).toContain('clip')
    expect(rows[1]!.text()).toContain('Vídeo da campanha')
    expect(rows[2]!.text()).toContain('ainda não gravado')

    await rows[0]!.find('button').trigger('click')
    expect(wrapper.emitted('watch')?.[0]).toEqual(['a'])
    await rows[1]!.find('button').trigger('click')
    expect(wrapper.emitted('watchClip')?.[0]).toEqual(['v'])
    await rows[2]!.find('button').trigger('click')
    expect(wrapper.emitted('record')?.[0]).toEqual(['b'])
  })

  it('avisa quando o take vai ser cortado', () => {
    const wrapper = mount(SlotList, {
      props: { items, takes: { b: take('b', 14) }, status: () => 'recorded' },
    })
    expect(wrapper.text()).toContain('será cortado em 0:10')
  })
})

describe('Teleprompter', () => {
  it('mostra o roteiro por linhas e ajusta a velocidade', async () => {
    const wrapper = mount(Teleprompter, { props: { script: 'linha um\nlinha dois', active: false } })
    expect(wrapper.findAll('p').map((p) => p.text())).toEqual(['linha um', 'linha dois'])
    expect(wrapper.text()).toContain('140 ppm')
    await wrapper.get('[aria-label="Mais rápido"]').trigger('click')
    expect(wrapper.text()).toContain('160 ppm')
  })
})

describe('UnsupportedNotice', () => {
  it('lista os motivos', () => {
    const wrapper = mount(UnsupportedNotice, { props: { blockers: ['sem WebCodecs', 'sem OPFS'] } })
    expect(wrapper.findAll('li')).toHaveLength(2)
  })
})
