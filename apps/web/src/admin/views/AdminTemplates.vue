<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type AdminTemplateSummary } from '../api'
import { importBundledTemplates } from '../importer'
import { newTemplate, uniqueId, type Aspect } from '../templates'
import AdminNav from '../components/AdminNav.vue'

const router = useRouter()
const templates = ref<AdminTemplateSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const status = ref<string | null>(null)
const creating = ref(false)
const newName = ref('')
const newAspect = ref<Aspect>('9:16')

const active = computed(() => templates.value.filter((t) => !t.archived))
const archived = computed(() => templates.value.filter((t) => t.archived))

async function refresh() {
  loading.value = true
  error.value = null
  try {
    templates.value = await api.listTemplates()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function create() {
  const name = newName.value.trim()
  if (!name) return
  error.value = null
  try {
    const id = uniqueId(name, templates.value.map((t) => t.id))
    await api.createTemplate(newTemplate(id, name, newAspect.value))
    await router.push({ name: 'admin-editor', params: { id } })
  } catch (e) {
    error.value = (e as Error).message
  }
}

/** Ordem em que os templates aparecem para os usuários. */
async function move(index: number, delta: number) {
  const list = active.value.slice()
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target]!, list[index]!]
  await Promise.all(list.map((t, i) => (t.sort === i ? null : api.updateMeta(t.id, { sort: i }))))
  await refresh()
}

async function setArchived(t: AdminTemplateSummary, value: boolean) {
  if (value && !confirm(`Arquivar “${t.name}”? Ele deixa de aparecer para os usuários.`)) return
  await api.updateMeta(t.id, { archived: value })
  await refresh()
}

async function importExamples() {
  error.value = null
  try {
    const done = await importBundledTemplates(templates.value.map((t) => t.id), (s) => (status.value = s))
    status.value = done.length ? `Importados: ${done.join(', ')}` : 'Os exemplos já estavam importados.'
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
    status.value = null
  }
}

function state(t: AdminTemplateSummary) {
  if (t.publishedVersion === null) return { label: 'Rascunho (não publicado)', cls: 'warn' }
  if (t.dirty) return { label: `v${t.publishedVersion} publicada · alterações não publicadas`, cls: 'warn' }
  return { label: `v${t.publishedVersion} publicada`, cls: 'ok' }
}

onMounted(refresh)
</script>

<template>
  <main class="page wide">
    <AdminNav />
    <section class="row head">
      <h1>Templates</h1>
      <div class="row">
        <button class="ghost small" @click="importExamples">Importar exemplos</button>
        <button class="small" data-testid="new-template" @click="creating = !creating">Novo template</button>
      </div>
    </section>

    <form v-if="creating" class="card row create" @submit.prevent="create">
      <label class="field grow"><span>Nome</span><input v-model="newName" required data-testid="new-template-name" /></label>
      <label class="field">
        <span>Formato</span>
        <select v-model="newAspect">
          <option value="9:16">Vertical 9:16</option>
          <option value="16:9">Horizontal 16:9</option>
          <option value="1:1">Quadrado 1:1</option>
        </select>
      </label>
      <button :disabled="!newName.trim()">Criar</button>
    </form>

    <p v-if="status" class="muted">{{ status }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading" class="muted">Carregando…</p>
    <p v-else-if="templates.length === 0" class="muted">Nenhum template ainda. Crie um ou importe os exemplos.</p>

    <ol class="list">
      <li v-for="(t, i) in active" :key="t.id" class="card row" :data-testid="`admin-template-${t.id}`">
        <div class="grow">
          <strong>{{ t.name }}</strong>
          <div class="row meta">
            <span class="badge" :class="state(t).cls">{{ state(t).label }}</span>
            <code class="muted">{{ t.id }}</code>
          </div>
        </div>
        <button class="ghost small" :disabled="i === 0" aria-label="Mover para cima" @click="move(i, -1)">↑</button>
        <button class="ghost small" :disabled="i === active.length - 1" aria-label="Mover para baixo" @click="move(i, 1)">↓</button>
        <button class="ghost small" @click="setArchived(t, true)">Arquivar</button>
        <button class="small" @click="router.push({ name: 'admin-editor', params: { id: t.id } })">Editar</button>
      </li>
    </ol>

    <details v-if="archived.length" class="archived">
      <summary class="muted">Arquivados ({{ archived.length }})</summary>
      <ol class="list">
        <li v-for="t in archived" :key="t.id" class="card row">
          <strong class="grow">{{ t.name }}</strong>
          <button class="ghost small" @click="setArchived(t, false)">Restaurar</button>
        </li>
      </ol>
    </details>
  </main>
</template>

<style scoped>
.wide {
  width: min(960px, 100%);
}
.head {
  justify-content: space-between;
}
h1 {
  margin: 0;
}
.create {
  align-items: end;
}
.grow {
  flex: 1;
  min-width: 180px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}
.meta {
  gap: 0.5rem;
  margin-top: 0.25rem;
  font-size: 0.8rem;
}
.archived {
  display: grid;
  gap: 0.5rem;
}
</style>
