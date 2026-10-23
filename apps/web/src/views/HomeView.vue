<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import type { TemplateEntry } from '@takeslot/templates'
import type { Template } from '@takeslot/schema'
import UnsupportedNotice from '../components/UnsupportedNotice.vue'
import { useCapabilities } from '../composables/useCapabilities'
import { useProjectStore } from '../stores/project'
import { requestPersistence } from '../lib/opfs'
import { formatDuration } from '../lib/format'
import { loadCatalog, type CatalogSource } from '../lib/catalog'

const router = useRouter()
const project = useProjectStore()
const { report, check } = useCapabilities()
const checking = ref(true)
const lostTakes = ref(0)
const entries = shallowRef<TemplateEntry[]>([])
const source = ref<CatalogSource | null>(null)

onMounted(async () => {
  const [, catalog] = await Promise.all([check(), loadCatalog()])
  entries.value = catalog.entries
  source.value = catalog.source
  checking.value = false
  if (report.value?.supported) lostTakes.value = (await project.verifyTakes()).length
})

/** Versão publicada mais nova do template em uso, se for diferente da que está sendo gravada. */
const newerVersion = computed(() => {
  const current = project.entry
  if (!current) return null
  const latest = entries.value.find((e) => e.template.id === current.template.id)
  return latest && latest.version !== undefined && latest.version !== current.version ? latest : null
})

function totalRange(t: Template) {
  const fixed = (t.intro?.duration ?? 0) + (t.outro?.duration ?? 0) + t.clips.reduce((s, c) => s + c.duration, 0)
  const max = fixed + t.slots.reduce((s, slot) => s + slot.maxDuration, 0)
  return `até ${formatDuration(max)}`
}

function aspectLabel(t: Template) {
  const { width, height } = t.canvas
  return width === height ? '1:1' : width > height ? '16:9' : '9:16'
}

async function choose(entry: TemplateEntry) {
  const sameTemplate = project.templateId === entry.template.id
  const sameVersion = sameTemplate && project.entry?.version === entry.version
  if (project.recordedCount > 0 && !sameVersion) {
    const message = sameTemplate
      ? 'Há uma versão nova deste template. Usar a versão nova apaga os takes já gravados. Continuar?'
      : 'Trocar de template apaga os takes já gravados. Continuar?'
    if (!confirm(message)) return
  }
  await project.selectTemplate(entry)
  void requestPersistence()
  const next = project.nextEmptySlot
  await router.push(next ? { name: 'record', params: { slot: next.id } } : { name: 'review' })
}
</script>

<template>
  <main class="page">
    <section>
      <h1>Grave por trechos. O vídeo sai pronto.</h1>
      <p class="muted">
        Escolha um template, grave cada trecho lendo o roteiro e exporte um MP4 com abertura, textos e trilha. Tudo acontece no seu
        aparelho: os vídeos não são enviados para nenhum servidor.
      </p>
    </section>

    <p v-if="checking" class="muted">Verificando o navegador…</p>
    <UnsupportedNotice v-else-if="report && !report.supported" :blockers="report.blockers" />
    <template v-else>
      <p v-for="w in report?.warnings ?? []" :key="w" class="warn">{{ w }}</p>
      <p v-if="lostTakes" class="warn">{{ lostTakes }} take(s) foram apagados pelo navegador e precisam ser regravados.</p>

      <div v-if="project.template" class="card resume">
        <div>
          <strong>Continuar “{{ project.template.name }}”</strong>
          <p class="muted">{{ project.recordedCount }} de {{ project.template.slots.length }} trechos gravados</p>
          <p v-if="newerVersion" class="warn small">Há uma versão nova deste template. Você continua na versão em que começou a gravar.</p>
        </div>
        <button @click="router.push({ name: 'review' })">Continuar</button>
      </div>

      <section class="templates">
        <p v-if="source === 'cache'" class="muted small">Sem conexão: mostrando os templates da última visita.</p>
        <article v-for="entry in entries" :key="entry.template.id" class="card template" :data-testid="`template-${entry.template.id}`">
          <div class="shape" :style="{ aspectRatio: `${entry.template.canvas.width} / ${entry.template.canvas.height}` }" aria-hidden="true" />
          <div class="body">
            <h2>{{ entry.template.name }}</h2>
            <p class="muted">{{ entry.template.description }}</p>
            <p class="muted small">
              {{ entry.template.slots.length }} trechos para gravar<template v-if="entry.template.clips.length"> + {{ entry.template.clips.length }} vídeo(s) pronto(s)</template>
              · {{ totalRange(entry.template) }} · {{ aspectLabel(entry.template) }}
            </p>
            <button @click="choose(entry)">{{ project.templateId === entry.template.id && project.entry?.version === entry.version ? 'Abrir' : 'Usar este template' }}</button>
          </div>
        </article>
      </section>
    </template>
  </main>
</template>

<style scoped>
h1 {
  font-size: clamp(1.5rem, 6vw, 2.2rem);
  margin: 0.5rem 0;
}
.resume {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.resume p {
  margin: 0.2rem 0 0;
}
.templates {
  display: grid;
  gap: 1rem;
}
.template {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.shape {
  flex: none;
  width: 64px;
  max-height: 110px;
  border-radius: 8px;
  background: linear-gradient(160deg, #1b1b3a, var(--accent));
}
.body h2 {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
}
.body p {
  margin: 0 0 0.5rem;
}
.small {
  font-size: 0.85rem;
}
</style>
