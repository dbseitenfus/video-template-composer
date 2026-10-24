<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
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
import { track } from '../lib/analytics'

const router = useRouter()
const project = useProjectStore()
const { report, check } = useCapabilities()
const checking = ref(true)
const lostTakes = ref(0)
const entries = shallowRef<TemplateEntry[]>([])
const source = ref<CatalogSource | null>(null)

// Fundo claro também na área de rolagem elástica (iOS) enquanto a página inicial está aberta.
const previousBodyBackground = document.body.style.background
document.body.style.background = '#f7f8fb'
onBeforeUnmount(() => {
  document.body.style.background = previousBodyBackground
})

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

/** O modelo em destaque ("em alta", marcado no admin) vem primeiro; os outros mantêm a ordem. */
const orderedEntries = computed(() => [...entries.value].sort((a, b) => Number(!!b.featured) - Number(!!a.featured)))

const templatesSection = ref<HTMLElement | null>(null)

/** Botão principal: com um só modelo, já começa; com vários, leva até a lista. */
function start() {
  if (entries.value.length === 1) return choose(entries.value[0]!)
  templatesSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const shareFeedback = ref<string | null>(null)
let shareTimer = 0

/** Compartilha o app: menu nativo do aparelho quando existe; senão, copia o link. */
async function shareApp() {
  const url = location.origin
  try {
    if (navigator.share) {
      await navigator.share({ title: site.brand, text: site.shareText, url })
      return
    }
    await navigator.clipboard.writeText(`${site.shareText} ${url}`)
    shareFeedback.value = 'Link copiado!'
  } catch (e) {
    // Fechar o menu de compartilhar não é erro.
    if ((e as Error).name === 'AbortError') return
    shareFeedback.value = `Copie o link: ${url}`
  }
  clearTimeout(shareTimer)
  shareTimer = window.setTimeout(() => (shareFeedback.value = null), 4000)
}
onBeforeUnmount(() => clearTimeout(shareTimer))

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
  track('template_selected', entry.template.id)
  void requestPersistence()
  const next = project.nextEmptySlot
  await router.push(next ? { name: 'record', params: { slot: next.id } } : { name: 'review' })
}
</script>

<template>
  <div class="home-bg">
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
        <button class="ghost share" data-testid="share" @click="shareApp">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7c0 .3 0 .5.1.8L8.4 11.2a3 3 0 1 0 0 3.6l6.7 3.4-.1.8a3 3 0 1 0 3-3Z" />
          </svg>
          Compartilhar o app
        </button>
      </div>
      <p v-if="shareFeedback" class="share-feedback" role="status">{{ shareFeedback }}</p>
      <p class="privacy">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" />
        </svg>
        {{ site.privacy }}
      </p>
      <p class="disclaimer-short">{{ site.disclaimer.short }} <a href="#aviso">Saiba mais</a></p>
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
        <article
          v-for="entry in orderedEntries"
          :key="entry.template.id"
          class="template"
          :class="{ featured: entry.featured }"
          :data-testid="`template-${entry.template.id}`"
        >
          <div class="thumb-box"><TemplateThumb :entry="entry" :height="entry.featured ? 260 : 168" /></div>
          <div class="body">
            <span v-if="entry.featured" class="hot" data-testid="hot-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M13.5 1.5s.7 3.3-1.6 6.1C9.9 10 8 11.5 8 14.5a4 4 0 0 0 8 0c0-1.3-.5-2.4-1-3.2 2.4 1 4 3.6 4 6.2A7 7 0 0 1 5 17.5C5 11 11 9 13.5 1.5Z" />
              </svg>
              Em alta
            </span>
            <h3>{{ entry.template.name }}</h3>
            <p class="muted">{{ entry.template.description }}</p>
            <ul class="chips">
              <li>{{ formatLabel(entry.template) }}</li>
              <li>{{ entry.template.slots.length }} {{ entry.template.slots.length === 1 ? "trecho" : "trechos" }} para gravar</li>
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
      <p id="aviso" class="disclaimer" role="note">{{ site.disclaimer.full }}</p>
      <span>Feito com</span>
      <BrandMark :size="20" />
      <p v-if="site.footnote" class="muted small">{{ site.footnote }}</p>
      <p class="credit">
        Desenvolvido por
        <a :href="site.credit.url" target="_blank" rel="noopener noreferrer">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
            />
          </svg>
          {{ site.credit.name }}
        </a>
      </p>
    </footer>
  </main>
  </div>
</template>

<style scoped>
/*
 * Paleta da página inicial: fundo claro, com o verde, o amarelo e o azul da bandeira
 * e o vermelho como destaque usados em pontos pequenos (faixa, selo, botões, números).
 * Sobrescreve as variáveis globais só aqui; as outras telas mantêm o tema escuro.
 */
.home-bg {
  --br-green: #009c3b;
  --br-yellow: #ffdf00;
  --br-blue: #002776;
  --red: #e30613;
  --accent: var(--red);
  --text: #0f1b3d;
  --muted: #55607a;
  --bg: #f7f8fb;
  --surface: #ffffff;
  --surface-2: #eef1f7;
  --border: #e1e5ee;
  --warn: #b45309;
  --danger: #c81e2d;
  color-scheme: light;
  min-height: 100dvh;
  color: var(--text);
  background: var(--bg);
}
.home {
  width: min(760px, 100%);
  margin: 0 auto;
  padding: 0 1rem calc(2rem + env(safe-area-inset-bottom));
  display: grid;
  gap: 1.75rem;
}
.hero {
  position: relative;
  overflow: hidden;
  margin: 0 -1rem;
  padding: 2.2rem 1.25rem 1.75rem;
  display: grid;
  gap: 0.9rem;
  justify-items: start;
  background:
    radial-gradient(70% 60% at 100% 0%, rgb(227 6 19 / 0.08), transparent 70%),
    radial-gradient(60% 60% at 0% 100%, rgb(0 156 59 / 0.08), transparent 70%),
    var(--surface);
  border-bottom: 1px solid var(--border);
}
/* Faixa com as cores do Brasil no topo. */
.hero::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 6px;
  background: linear-gradient(90deg, var(--br-green) 0 25%, var(--br-yellow) 25% 50%, #1f5bd8 50% 75%, var(--red) 75%);
}
.hero > * {
  position: relative;
}
@media (min-width: 760px) {
  .hero {
    margin: 1rem 0 0;
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 2.5rem 2.25rem 2rem;
    box-shadow: 0 12px 40px rgb(15 27 61 / 0.08);
  }
}
.eyebrow {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  background: var(--br-yellow);
  color: var(--br-blue);
}
h1 {
  font-size: clamp(1.75rem, 7.5vw, 2.7rem);
  line-height: 1.08;
  letter-spacing: -0.02em;
  margin: 0;
  text-wrap: balance;
  color: var(--br-blue);
}
.lead {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.5;
  color: #33405e;
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
  background: var(--red);
  box-shadow: 0 10px 24px rgb(227 6 19 / 0.28);
}
.cta:hover:not(:disabled) {
  background: #c40512;
}
.share {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.share-feedback {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--br-green);
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
  background: var(--br-blue);
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
  border-top: 3px solid var(--br-yellow);
  border-radius: 16px;
  box-shadow: 0 4px 16px rgb(15 27 61 / 0.05);
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
/* Modelo em destaque: card maior, borda vermelha e selo "Em alta". */
.template.featured {
  padding: 1.1rem;
  border: 2px solid var(--red);
  border-top-width: 5px;
  box-shadow: 0 12px 32px rgb(227 6 19 / 0.16);
}
.template.featured .thumb-box {
  width: 220px;
}
.template.featured .thumb-box :deep(.thumb) {
  max-height: 260px;
}
.template.featured .body h3 {
  font-size: 1.35rem;
}
.hot {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: var(--red);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
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
  .template.featured {
    padding: 0.9rem;
  }
  .template.featured .thumb-box {
    width: 120px;
  }
  .template.featured .thumb-box :deep(.thumb) {
    max-height: 210px;
  }
  .template.featured .body h3 {
    font-size: 1.15rem;
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
.credit {
  font-size: 0.8rem;
}
.disclaimer {
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--muted);
  max-width: 34rem;
  margin: 0 auto 0.5rem !important;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  scroll-margin-top: 1rem;
}
.disclaimer-short {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.disclaimer-short a {
  color: var(--br-blue);
  font-weight: 600;
}
.credit a {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}
.credit a:hover,
.credit a:focus-visible {
  text-decoration: underline;
}
.center {
  text-align: center;
}
.small {
  font-size: 0.85rem;
}
</style>
