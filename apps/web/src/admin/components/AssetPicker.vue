<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, type Asset, type AssetKind } from '../api'
import { useLibrary } from '../library'
import { prepareUpload } from '../upload'
import { formatBytes, formatDuration } from '../../lib/format'

/** Biblioteca de arquivos: escolher um arquivo existente ou subir um novo. */
const props = defineProps<{ kind?: AssetKind; selectable?: boolean }>()
const emit = defineEmits<{ select: [asset: Asset]; close: [] }>()

const library = useLibrary()
const assets = library.assets
const loading = ref(true)
const busy = ref<string | null>(null)
const error = ref<string | null>(null)

const accept = computed(() =>
  props.kind === 'image' ? 'image/svg+xml,image/png,image/jpeg,image/webp' : props.kind === 'audio' ? 'audio/*' : props.kind === 'video' ? 'video/*' : 'image/*,audio/*,video/*',
)
const visible = computed(() => (props.kind ? assets.value.filter((a) => a.kind === props.kind) : assets.value))

async function refresh() {
  loading.value = true
  try {
    await library.refresh()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function upload(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  ;(event.target as HTMLInputElement).value = ''
  error.value = null
  let last: Asset | null = null
  for (const file of files) {
    try {
      busy.value = `Preparando ${file.name}…`
      const prepared = await prepareUpload(file, (p) => (busy.value = `Convertendo ${file.name} para H.264… ${Math.round(p * 100)}%`))
      busy.value = `Enviando ${prepared.name} (${formatBytes(prepared.file.size)})…`
      last = await api.uploadAsset(prepared.file, prepared.name, prepared)
    } catch (e) {
      error.value = `${file.name}: ${(e as Error).message}`
    }
  }
  busy.value = null
  await refresh()
  if (last && props.selectable && files.length === 1) emit('select', last)
}

async function remove(asset: Asset) {
  if (!confirm(`Apagar “${asset.name}” da biblioteca?`)) return
  error.value = null
  try {
    await api.deleteAsset(asset.key)
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

function details(a: Asset) {
  const parts = [formatBytes(a.size)]
  if (a.width && a.height) parts.unshift(`${a.width}×${a.height}`)
  if (a.duration) parts.unshift(formatDuration(a.duration))
  return parts.join(' · ')
}

onMounted(refresh)
</script>

<template>
  <div class="picker">
    <div class="row head">
      <label class="upload">
        <input type="file" :accept="accept" multiple :disabled="!!busy" data-testid="asset-upload" @change="upload" />
        <span>{{ busy ?? 'Enviar arquivo' }}</span>
      </label>
      <p class="muted small">
        Vídeos são convertidos para MP4 H.264/AAC no seu navegador antes do envio, se precisar. Máximo de 95 MB por arquivo.
      </p>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading" class="muted">Carregando…</p>
    <p v-else-if="visible.length === 0" class="muted">Nenhum arquivo ainda.</p>
    <ul class="grid">
      <li v-for="a in visible" :key="a.key" :data-testid="`asset-${a.name}`">
        <div class="thumb">
          <img v-if="a.kind === 'image'" :src="a.url" alt="" loading="lazy" />
          <video v-else-if="a.kind === 'video'" :src="`${a.url}#t=0.5`" preload="metadata" muted playsinline />
          <span v-else>♪</span>
        </div>
        <strong :title="a.name">{{ a.name }}</strong>
        <small class="muted">{{ details(a) }}</small>
        <div class="row actions">
          <button v-if="selectable" class="small" @click="emit('select', a)">Usar</button>
          <button class="ghost small" @click="remove(a)">Apagar</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  gap: 0.75rem;
}
.head {
  align-items: center;
}
.head p {
  margin: 0;
  flex: 1;
  min-width: 200px;
}
.small {
  font-size: 0.8rem;
}
.upload {
  position: relative;
  display: inline-block;
  padding: 0.6rem 1.1rem;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}
li {
  display: grid;
  gap: 0.3rem;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  min-width: 0;
}
li strong {
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.thumb {
  height: 100px;
  border-radius: 8px;
  background: repeating-conic-gradient(#2a2a4d 0 25%, #24244a 0 50%) 0 0 / 16px 16px;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-size: 2rem;
  color: var(--muted);
}
.thumb img,
.thumb video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.actions {
  gap: 0.3rem;
}
</style>
