import type { Clip, Slot, Template } from './index'

/** Item da sequência do vídeo entre a abertura e o encerramento: trecho gravado ou vídeo pré-gravado. */
export type SequenceItem = { kind: 'slot'; slot: Slot } | { kind: 'clip'; clip: Clip }

/** Ordem em que os trechos e clipes aparecem no vídeo (a mesma da linha do tempo). */
export function templateSequence(template: Pick<Template, 'slots' | 'clips'>): SequenceItem[] {
  const items: SequenceItem[] = []
  const clipsAfter = (after: string) => {
    for (const clip of template.clips) if (clip.after === after) items.push({ kind: 'clip', clip })
  }
  clipsAfter('intro')
  for (const slot of template.slots) {
    items.push({ kind: 'slot', slot })
    clipsAfter(slot.id)
  }
  return items
}

/**
 * Converte uma ordem livre de itens de volta para o formato do template:
 * slots na ordem da lista e cada clipe com `after` apontando para o slot anterior
 * (ou `intro`, se vier antes de qualquer slot).
 */
export function applySequence<T extends Pick<Template, 'slots' | 'clips'>>(template: T, items: SequenceItem[]): T {
  const slots: Slot[] = []
  const clips: Clip[] = []
  let after = 'intro'
  for (const item of items) {
    if (item.kind === 'slot') {
      slots.push(item.slot)
      after = item.slot.id
    } else {
      clips.push({ ...item.clip, after })
    }
  }
  return { ...template, slots, clips }
}

/** Move o item `from` para a posição `to` (índices na sequência). */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items
  const next = items.slice()
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!)
  return next
}
