import { parseTemplate, type TemplateInput } from '@takeslot/schema'

export function makeTemplate(overrides: Partial<TemplateInput> = {}) {
  return parseTemplate({
    schemaVersion: 1,
    id: 'teste',
    name: 'Teste',
    canvas: { width: 1080, height: 1920 },
    fps: 30,
    intro: { duration: 2, background: { type: 'color', color: '#112233' }, layers: [{ type: 'text', text: '{{template.name}}', x: 0.5, y: 0.5 }] },
    slots: [
      { id: 'a', label: 'Primeira', script: 'Roteiro A', maxDuration: 10, layers: [{ type: 'text', text: '{{slot.label}}', x: 0.5, y: 0.85, start: 0.5, end: -0.5 }] },
      { id: 'b', label: 'Segunda', script: 'Roteiro B', maxDuration: 5 },
    ],
    outro: { duration: 3, background: { type: 'gradient', from: '#000000', to: '#ffffff' } },
    music: { asset: 'trilha.wav', volume: 0.6, duckedVolume: 0.1, duckRamp: 0.5, fadeIn: 1, fadeOut: 2 },
    ...overrides,
  })
}
