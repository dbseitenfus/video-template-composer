<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { templates } from '@takeslot/templates'
import UnsupportedNotice from '../components/UnsupportedNotice.vue'
import { useCapabilities } from '../composables/useCapabilities'
import { useProjectStore } from '../stores/project'
import { requestPersistence } from '../lib/opfs'
import { formatDuration } from '../lib/format'

const router = useRouter()
const project = useProjectStore()
const { report, check } = useCapabilities()
const checking = ref(true)
const lostTakes = ref(0)

onMounted(async () => {
  await check()
  checking.value = false
  if (report.value?.supported) lostTakes.value = (await project.verifyTakes()).length
})

function totalRange(id: string) {
  const t = templates.find((e) => e.template.id === id)!.template
  const fixed = (t.intro?.duration ?? 0) + (t.outro?.duration ?? 0) + t.clips.reduce((s, c) => s + c.duration, 0)
  const max = fixed + t.slots.reduce((s, slot) => s + slot.maxDuration, 0)
  return `até ${formatDuration(max)}`
}

async function choose(id: string) {
  if (project.templateId && project.templateId !== id && project.recordedCount > 0) {
    if (!confirm('Trocar de template apaga os takes já gravados. Continuar?')) return
  }
  await project.selectTemplate(id)
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
        </div>
        <button @click="router.push({ name: 'review' })">Continuar</button>
      </div>

      <section class="templates">
        <article v-for="{ template } in templates" :key="template.id" class="card template" :data-testid="`template-${template.id}`">
          <div class="shape" :style="{ aspectRatio: `${template.canvas.width} / ${template.canvas.height}` }" aria-hidden="true" />
          <div class="body">
            <h2>{{ template.name }}</h2>
            <p class="muted">{{ template.description }}</p>
            <p class="muted small">{{ template.slots.length }} trechos · {{ totalRange(template.id) }} · {{ template.canvas.width > template.canvas.height ? '16:9' : '9:16' }}</p>
            <button @click="choose(template.id)">{{ project.templateId === template.id ? 'Abrir' : 'Usar este template' }}</button>
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
