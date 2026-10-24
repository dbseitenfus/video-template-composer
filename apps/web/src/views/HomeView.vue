<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import type { TemplateEntry } from '@takeslot/templates'
import type { Template } from '@takeslot/schema'
import BrandMark from '../components/BrandMark.vue'
import TemplateThumb from '../components/TemplateThumb.vue'
import UnsupportedNotice from '../components/UnsupportedNotice.vue'
import { site } from '../site'
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

function formatLabel(t: Template) {
  const { width, height } = t.canvas
  return width === height ? 'Quadrado · feed' : width > height ? 'Horizontal · YouTube' : 'Vertical · Stories e WhatsApp'
}

const templatesSection = ref<HTMLElement | null>(null)

/** Botão principal: com um só modelo, já começa; com vários, leva até a lista. */
function start() {
  if (entries.value.length === 1) return choose(entries.value[0]!)
  templatesSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  <main class="home">
    <section class="hero">
      <BrandMark :size="34" class="hero-brand" />
      <span class="eyebrow">{{ site.eyebrow }}</span>
      <h1>{{ site.headline }}</h1>
      <p class="lead">{{ site.subheadline }}</p>
      <div class="hero-actions">
        <button class="cta" :disabled="checking || (report !== null && !report.supported)" data-testid="cta" @click="start">
          {{ site.cta }}
        </button>
        <button v-if="project.template" class="ghost" @click="router.push({ name: 'review' })">Continuar meu vídeo</button>
      </div>
      <p class="privacy">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" />
        </svg>
        {{ site.privacy }}
      </p>
    </section>

    <section class="steps-section" aria-labelledby="como-funciona">
      <h2 id="como-funciona">Como funciona</h2>
      <ol class="steps">
        <li v-for="(step, i) in site.steps" :key="step.title">
          <span class="num" aria-hidden="true">{{ i + 1 }}</span>
          <div>
            <strong>{{ step.title }}</strong>
            <p>{{ step.text }}</p>
          </div>
        </li>
      </ol>
    </section>

    <p v-if="checking" class="muted center">Verificando o navegador…</p>
    <UnsupportedNotice v-else-if="report && !report.supported" :blockers="report.blockers" />
    <template v-else>
      <p v-for="w in report?.warnings ?? []" :key="w" class="warn small">{{ w }}</p>
      <p v-if="lostTakes" class="warn">{{ lostTakes }} trecho(s) foram apagados pelo navegador e precisam ser gravados de novo.</p>

      <div v-if="project.template" class="card resume">
        <div>
          <strong>Você tem um vídeo em andamento</strong>
          <p class="muted">“{{ project.template.name }}”: {{ project.recordedCount }} de {{ project.template.slots.length }} trechos gravados</p>
          <p v-if="newerVersion" class="warn small">Há uma versão nova deste modelo. Você continua na versão em que começou.</p>
        </div>
        <button @click="router.push({ name: 'review' })">Continuar</button>
      </div>

      <section ref="templatesSection" class="templates" aria-labelledby="modelos">
        <h2 id="modelos">Escolha o modelo</h2>
        <p v-if="source === 'cache'" class="muted small">Sem conexão: mostrando os modelos da última visita.</p>
        <article v-for="entry in entries" :key="entry.template.id" class="template" :data-testid="`template-${entry.template.id}`">
          <div class="thumb-box"><TemplateThumb :entry="entry" :height="168" /></div>
          <div class="body">
            <h3>{{ entry.template.name }}</h3>
            <p class="muted">{{ entry.template.description }}</p>
            <ul class="chips">
              <li>{{ formatLabel(entry.template) }}</li>
              <li>{{ entry.template.slots.length }} trechos para gravar</li>
              <li>{{ totalRange(entry.template) }}</li>
            </ul>
            <button @click="choose(entry)">
              {{ project.templateId === entry.template.id && project.entry?.version === entry.version ? 'Continuar este vídeo' : 'Gravar com este modelo' }}
            </button>
          </div>
        </article>
      </section>
    </template>

    <footer class="footer">
      <span>Feito com</span>
      <BrandMark :size="20" />
      <p v-if="site.footnote" class="muted small">{{ site.footnote }}</p>
    </footer>
  </main>
</template>

<style scoped>
.home {
  width: min(760px, 100%);
  margin: 0 auto;
  padding: 0 1rem calc(2rem + env(safe-area-inset-bottom));
  display: grid;
  gap: 1.75rem;
}
.hero {
  margin: 0 -1rem;
  padding: 2rem 1.25rem 1.75rem;
  display: grid;
  gap: 0.9rem;
  justify-items: start;
  background:
    radial-gradient(120% 90% at 100% 0%, rgb(225 29 46 / 0.45), transparent 60%),
    radial-gradient(90% 80% at 0% 100%, rgb(255 90 54 / 0.25), transparent 60%),
    var(--surface);
  border-bottom: 1px solid var(--border);
}
@media (min-width: 760px) {
  .hero {
    margin: 1rem 0 0;
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 2.5rem 2.25rem 2rem;
  }
}
.eyebrow {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.1);
  color: #ffd2c6;
}
h1 {
  font-size: clamp(1.75rem, 7.5vw, 2.7rem);
  line-height: 1.08;
  letter-spacing: -0.02em;
  margin: 0;
  text-wrap: balance;
}
.lead {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.5;
  color: #e4e2f0;
  max-width: 36rem;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.4rem;
}
.cta {
  font-size: 1.05rem;
  padding: 0.95rem 1.6rem;
  box-shadow: 0 10px 24px rgb(255 90 54 / 0.35);
}
.privacy {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}
h2 {
  font-size: 1.25rem;
  margin: 0 0 0.75rem;
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
@media (min-width: 640px) {
  .steps {
    grid-template-columns: repeat(2, 1fr);
  }
}
.steps li {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  padding: 0.9rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
}
.num {
  flex: none;
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-weight: 800;
}
.steps p {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.4;
}
.resume {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  border-color: var(--accent);
}
.resume p {
  margin: 0.2rem 0 0;
}
.templates {
  display: grid;
  gap: 0.9rem;
  scroll-margin-top: 1rem;
}
.templates h2 {
  margin: 0;
}
.template {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.9rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}
.body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.5rem;
  justify-items: start;
}
.body h3 {
  margin: 0;
  font-size: 1.1rem;
}
.body p {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.4;
}
.chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.chips li {
  font-size: 0.75rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
}
/* Coluna fixa para a miniatura: formatos diferentes não desalinham o texto. */
.thumb-box {
  flex: none;
  width: 150px;
  display: grid;
  place-items: center;
  align-self: stretch;
}
.thumb-box :deep(.thumb) {
  width: auto !important;
  height: auto !important;
  max-width: 100%;
  max-height: 168px;
}
@media (max-width: 520px) {
  .template {
    gap: 0.8rem;
    align-items: flex-start;
    padding: 0.75rem;
  }
  .thumb-box {
    width: 84px;
    align-self: flex-start;
  }
  .thumb-box :deep(.thumb) {
    max-height: 140px;
    border-radius: 8px;
  }
  .body h3 {
    font-size: 1rem;
  }
  .body p {
    font-size: 0.85rem;
  }
  .body button {
    width: 100%;
    padding: 0.6rem 1rem;
  }
  .steps li {
    padding: 0.75rem;
  }
}
.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.85rem;
}
.footer p {
  flex-basis: 100%;
  text-align: center;
  margin: 0;
}
.center {
  text-align: center;
}
.small {
  font-size: 0.85rem;
}
</style>
