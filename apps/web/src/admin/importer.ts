import { templateAssets } from '@takeslot/schema'
import { templates as bundled } from '@takeslot/templates'
import { api } from './api'
import { remapAssets } from './templates'
import { prepareUpload } from './upload'

const TYPES: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', wav: 'audio/wav', mp3: 'audio/mpeg', mp4: 'video/mp4' }

/**
 * Copia os templates embutidos no app para o backend (arquivos no R2, template no D1)
 * e publica. Serve para começar a produção com os exemplos já prontos para editar.
 */
export async function importBundledTemplates(existingIds: string[], onStatus: (s: string) => void): Promise<string[]> {
  const imported: string[] = []
  for (const entry of bundled) {
    if (existingIds.includes(entry.template.id)) continue
    const { images, audio, videos, thumbnail } = templateAssets(entry.template)
    const map: Record<string, string> = {}
    for (const name of [...images, ...audio, ...videos, ...thumbnail]) {
      onStatus(`Enviando ${name}…`)
      const blob = await (await fetch(entry.assets[name]!)).blob()
      const type = TYPES[name.split('.').pop() ?? ''] ?? blob.type
      const file = new File([blob], name, { type })
      const prepared = await prepareUpload(file)
      map[name] = (await api.uploadAsset(prepared.file, prepared.name, prepared)).key
    }
    onStatus(`Publicando ${entry.template.name}…`)
    await api.createTemplate(remapAssets(entry.template, map))
    await api.publish(entry.template.id)
    imported.push(entry.template.id)
  }
  return imported
}
