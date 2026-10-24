<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { safeParseTemplate, templateAssets, type Template } from '@takeslot/schema'
import type { TemplateEntry } from '@takeslot/templates'
import PreviewPlayer from '../../components/PreviewPlayer.vue'
import { api, ApiError, type Issue } from '../api'
import { useLibrary } from '../library'
import { ASPECTS, aspectOf, describePath, placeholderDuration, type Aspect } from '../templates'
import AdminNav from '../components/AdminNav.vue'
import AssetField from '../components/AssetField.vue'
import SequenceEditor from '../components/SequenceEditor.vue'

const route = useRoute()
const library = useLibrary()
const id = computed(() => String(route.params.id))

const draft = ref<Template | null>(null)
/** JSON do último rascunho salvo, para saber se há mudanças locais. */
const savedJson = ref('')
const publishedVersion = ref<number | null>(null)
const serverDirty = ref(false)
const loadError = ref<string | null>(null)
const busy = ref<'save' | 'publish' | null>(null)
const message = ref<string | null>(null)
const serverIssues = ref<Issue[]>([])
const jsonText = ref('')
const jsonError = ref<string | null>(null)

const localDirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== savedJson.value)
const validation = computed(() => (draft.value ? safeParseTemplate(draft.value) : null))
const issues = computed<Issue[]>(() =>
  validation.value && !validation.value.success
    ? validation.value.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    : serverIssues.value,
)

const status = computed(() => {
  if (localDirty.value) return { label: 'Alterações não salvas', cls: 'warn' }
  if (publishedVersion.value === null) return { label: 'Rascunho salvo · não publicado', cls: 'warn' }
  if (serverDirty.value) return { label: `Rascunho salvo · v${publishedVersion.value} no ar`, cls: 'warn' }
  return { label: `v${publishedVersion.value} publicada`, cls: 'ok' }
})

const aspect = computed({
  get: () => (draft.value ? aspectOf(draft.value) : null),
  set: (value: Aspect | null) => {
    if (draft.value && value) draft.value.canvas = { ...ASPECTS[value] }
  },
})

async function load() {
  loadError.value = null
  try {
    const [detail] = await Promise.all([api.getTemplate(id.value), library.ensure()])
    draft.value = detail.template
    savedJson.value = JSON.stringify(detail.template)
    publishedVersion.value = detail.publishedVersion
    serverDirty.value = detail.dirty
  } catch (e) {
    loadError.value = (e as Error).message
  }
}

async function save(): Promise<boolean> {
  if (!draft.value || !validation.value?.success) return false
  busy.value = 'save'
  message.value = null
  serverIssues.value = []
  try {
    const saved = await api.saveTemplate(id.value, validation.value.data)
    draft.value = saved
    savedJson.value = JSON.stringify(saved)
    serverDirty.value = true
    message.value = 'Rascunho salvo.'
    return true
  } catch (e) {
    message.value = (e as Error).message
    if (e instanceof ApiError) serverIssues.value = e.issues
    return false
  } finally {
    busy.value = null
  }
}

async function publish() {
  if (localDirty.value && !(await save())) return
  busy.value = 'publish'
  message.value = null
  try {
    publishedVersion.value = await api.publish(id.value)
    serverDirty.value = false
    message.value = `Versão ${publishedVersion.value} publicada. Novos usuários já recebem esta versão; quem já está gravando continua na anterior.`
  } catch (e) {
    message.value = (e as Error).message
    if (e instanceof ApiError) serverIssues.value = e.issues
  } finally {
    busy.value = null
  }
}

function openJson() {
  jsonText.value = JSON.stringify(draft.value, null, 2)
  jsonError.value = null
}

function applyJson() {
  try {
    const parsed = safeParseTemplate(JSON.parse(jsonText.value))
    if (!parsed.success) {
      jsonError.value = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
      return
    }
    if (parsed.data.id !== id.value) {
      jsonError.value = 'O id do template não pode mudar.'
      return
    }
    draft.value = parsed.data
    jsonError.value = null
  } catch (e) {
    jsonError.value = `JSON inválido: ${(e as Error).message}`
  }
}

// Preview: só de rascunhos válidos e com um pequeno atraso para não recarregar a cada tecla.
const previewEntry = shallowRef<TemplateEntry | null>(null)
const previewDurations = shallowRef<Record<string, number>>({})
let previewTimer = 0
watch(
  validation,
  (v) => {
    clearTimeout(previewTimer)
    if (!v?.success) return
    previewTimer = window.setTimeout(() => {
      const template = v.data
      const { images, audio, videos, thumbnail } = templateAssets(template)
      const assets = Object.fromEntries([...images, ...audio, ...videos, ...thumbnail].map((k) => [k, `/api/assets/${encodeURIComponent(k)}`]))
      previewDurations.value = Object.fromEntries(template.slots.map((s) => [s.id, placeholderDuration(s)]))
      previewEntry.value = { template, assets }
    }, 500)
  },
  { immediate: true },
)

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (localDirty.value) e.preventDefault()
}
onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  void load()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  clearTimeout(previewTimer)
})
onBeforeRouteLeave(() => !localDirty.value || confirm('Há alterações não salvas. Sair mesmo assim?'))
</script>

<template>
  <main class="page editor-page">
    <AdminNav />
    <p v-if="loadError" class="error">{{ loadError }}</p>
    <template v-else-if="draft">
      <header class="row toolbar">
        <div class="grow">
          <h1>{{ draft.name }}</h1>
          <span class="badge" :class="status.cls" data-testid="editor-status">{{ status.label }}</span>
        </div>
        <button class="ghost" :disabled="!localDirty || !validation?.success || !!busy" data-testid="save" @click="save">
          {{ busy === 'save' ? 'Salvando…' : 'Salvar rascunho' }}
        </button>
        <button :disabled="!validation?.success || !!busy || (!localDirty && !serverDirty && publishedVersion !== null)" data-testid="publish" @click="publish">
          {{ busy === 'publish' ? 'Publicando…' : 'Publicar' }}
        </button>
      </header>
      <p v-if="message" class="muted" data-testid="editor-message">{{ message }}</p>
      <ul v-if="issues.length" class="issues error">
        <li v-for="issue in issues" :key="issue.path + issue.message">
          <strong>{{ describePath(draft, issue.path) }}:</strong> {{ issue.message }}
        </li>
      </ul>

      <div class="layout">
        <div class="forms">
          <section class="card">
            <h2>Sequência do vídeo</h2>
            <SequenceEditor v-model="draft" :names="library.names.value" :assets="library.byKey.value" />
          </section>

          <section class="card">
            <h2>Geral</h2>
            <div class="fields">
              <label class="field wide"><span>Nome</span><input v-model="draft.name" /></label>
              <label class="field wide"><span>Descrição</span><input v-model="draft.description" /></label>
              <div class="wide row thumb-field">
                <AssetField v-model="draft.thumbnail" kind="image" label="Capa na página inicial (opcional)" :names="library.names.value" />
                <button v-if="draft.thumbnail" class="ghost small" type="button" @click="draft.thumbnail = undefined">Usar quadro do vídeo</button>
              </div>
              <label class="field">
                <span>Formato</span>
                <select v-model="aspect">
                  <option value="9:16">Vertical 9:16</option>
                  <option value="16:9">Horizontal 16:9</option>
                  <option value="1:1">Quadrado 1:1</option>
                  <option v-if="!aspect" :value="null">Personalizado ({{ draft.canvas.width }}×{{ draft.canvas.height }})</option>
                </select>
              </label>
              <label class="field">
                <span>Quadros por segundo</span>
                <select v-model.number="draft.fps">
                  <option :value="24">24</option>
                  <option :value="25">25</option>
                  <option :value="30">30</option>
                </select>
              </label>
              <label class="field">
                <span>Transição</span>
                <select v-model="draft.transition.type">
                  <option value="fade-black">Escurecer</option>
                  <option value="cut">Corte seco</option>
                </select>
              </label>
              <label v-if="draft.transition.type === 'fade-black'" class="field">
                <span>Duração da transição (s)</span>
                <input v-model.number="draft.transition.duration" type="number" min="0.1" max="2" step="0.05" />
              </label>
            </div>
          </section>

          <section class="card">
            <h2>Marca</h2>
            <label class="check">
              <input
                type="checkbox"
                :checked="!!draft.logo"
                @change="draft.logo = ($event.target as HTMLInputElement).checked ? { asset: '', position: 'top-right', width: 0.2, margin: 0.04, opacity: 0.9, showOn: 'slots' } : undefined"
              />
              Logo por cima do vídeo
            </label>
            <div v-if="draft.logo" class="fields">
              <AssetField v-model="draft.logo.asset" class="wide" kind="image" label="Imagem do logo" :names="library.names.value" />
              <label class="field">
                <span>Posição</span>
                <select v-model="draft.logo.position">
                  <option value="top-left">Topo à esquerda</option>
                  <option value="top-right">Topo à direita</option>
                  <option value="bottom-left">Base à esquerda</option>
                  <option value="bottom-right">Base à direita</option>
                </select>
              </label>
              <label class="field"><span>Largura ({{ Math.round(draft.logo.width * 100) }}%)</span><input v-model.number="draft.logo.width" type="range" min="0.05" max="0.6" step="0.01" /></label>
              <label class="field"><span>Opacidade ({{ Math.round(draft.logo.opacity * 100) }}%)</span><input v-model.number="draft.logo.opacity" type="range" min="0.1" max="1" step="0.05" /></label>
              <label class="field">
                <span>Mostrar em</span>
                <select v-model="draft.logo.showOn">
                  <option value="slots">Só nos trechos gravados</option>
                  <option value="all">Vídeo inteiro</option>
                </select>
              </label>
            </div>

            <label class="check">
              <input
                type="checkbox"
                :checked="!!draft.music"
                @change="draft.music = ($event.target as HTMLInputElement).checked ? { asset: '', volume: 0.55, duckedVolume: 0.1, duckRamp: 0.4, fadeIn: 1, fadeOut: 1.5, loop: true } : undefined"
              />
              Trilha sonora
            </label>
            <div v-if="draft.music" class="fields">
              <AssetField v-model="draft.music.asset" class="wide" kind="audio" label="Arquivo da trilha" :names="library.names.value" />
              <label class="field"><span>Volume ({{ Math.round(draft.music.volume * 100) }}%)</span><input v-model.number="draft.music.volume" type="range" min="0" max="1" step="0.05" /></label>
              <label class="field"><span>Volume durante falas ({{ Math.round(draft.music.duckedVolume * 100) }}%)</span><input v-model.number="draft.music.duckedVolume" type="range" min="0" max="1" step="0.01" /></label>
              <label class="field"><span>Fade de entrada (s)</span><input v-model.number="draft.music.fadeIn" type="number" min="0" step="0.1" /></label>
              <label class="field"><span>Fade de saída (s)</span><input v-model.number="draft.music.fadeOut" type="number" min="0" step="0.1" /></label>
              <label class="check"><input v-model="draft.music.loop" type="checkbox" /> Repetir em loop</label>
            </div>
          </section>

          <details class="card" @toggle="($event.target as HTMLDetailsElement).open && openJson()">
            <summary><strong>JSON (avançado)</strong></summary>
            <p class="muted small">Para ajustes que o formulário não cobre. O JSON é validado antes de ser aplicado.</p>
            <textarea v-model="jsonText" class="json" spellcheck="false" />
            <pre v-if="jsonError" class="error small">{{ jsonError }}</pre>
            <div class="row">
              <button class="ghost small" @click="openJson">Recarregar</button>
              <button class="small" @click="applyJson">Aplicar JSON</button>
            </div>
          </details>
        </div>

        <aside class="preview">
          <div class="card sticky">
            <h2>Preview</h2>
            <PreviewPlayer v-if="previewEntry" :entry="previewEntry" :take-durations="previewDurations" placeholders />
            <p v-else class="muted">Corrija os erros para ver o preview.</p>
            <p class="muted small">Os trechos gravados pelo usuário aparecem como marcadores, com a duração estimada.</p>
          </div>
        </aside>
      </div>
    </template>
    <p v-else class="muted">Carregando…</p>
  </main>
</template>

<style scoped>
.editor-page {
  width: min(1280px, 100%);
}
.toolbar {
  align-items: center;
}
.grow {
  flex: 1;
  min-width: 200px;
}
h1 {
  margin: 0 0 0.25rem;
  font-size: 1.4rem;
}
h2 {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
}
.small {
  font-size: 0.85rem;
}
.issues {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.9rem;
}
.layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 980px) {
  .layout {
    grid-template-columns: minmax(0, 1fr) 360px;
  }
}
.forms {
  display: grid;
  gap: 1rem;
  align-content: start;
}
.forms .card {
  display: grid;
  gap: 0.75rem;
}
.sticky {
  position: sticky;
  top: 1rem;
}
.thumb-field {
  align-items: end;
}
.thumb-field > :first-child {
  flex: 1;
}
.json {
  min-height: 320px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 0.8rem;
}
pre {
  white-space: pre-wrap;
  margin: 0;
}
</style>
