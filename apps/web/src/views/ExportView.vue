<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Resolution } from '@takeslot/schema'
import ExportProgress from '../components/ExportProgress.vue'
import PreviewPlayer from '../components/PreviewPlayer.vue'
import { useCapabilities } from '../composables/useCapabilities'
import { jobIdFor, useExport } from '../composables/useExport'
import { useWakeLock } from '../composables/useWakeLock'
import { useExportStore } from '../stores/export'
import { useProjectStore } from '../stores/project'
import { formatBytes, formatDuration } from '../lib/format'

const router = useRouter()
const project = useProjectStore()
const store = useExportStore()
const exporter = useExport()
const wakeLock = useWakeLock()
const { report, check } = useCapabilities()

const preview = ref<InstanceType<typeof PreviewPlayer> | null>(null)
const resolution = ref<Resolution>(project.template!.resolutions[0]!)
const leftDuringExport = ref(false)
const shareError = ref<string | null>(null)
const resultUrl = ref<string | null>(null)

const entry = computed(() => project.entry!)
const takePaths = computed(() => Object.fromEntries(Object.entries(project.takes).map(([id, t]) => [id, t.path])))
const busy = computed(() => ['preparing', 'benchmarking', 'exporting'].includes(store.status))
const currentJobId = computed(() => jobIdFor(entry.value.template.id, Object.values(project.takes).map((t) => t.id)))
/** Resultado salvo pertence aos takes atuais? (se regravou algo, não vale mais) */
const resultIsCurrent = computed(() => store.status === 'done' && store.result && store.jobId === currentJobId.value)

async function exportVideo() {
  preview.value?.pause()
  leftDuringExport.value = false
  await wakeLock.request()
  await exporter.start(resolution.value)
  await wakeLock.release()
}

// Retomada automática: a aba foi descartada (comum no iOS) no meio de uma exportação destes mesmos takes.
onMounted(async () => {
  await check()
  if (store.pending && store.jobId === currentJobId.value && !busy.value) {
    await wakeLock.request()
    await exporter.start(store.resolution ?? resolution.value, { resume: true })
    await wakeLock.release()
  } else if (store.jobId && store.jobId !== currentJobId.value) {
    await exporter.discard()
  }
})

function onVisibility() {
  if (document.visibilityState === 'hidden' && busy.value) leftDuringExport.value = true
}
document.addEventListener('visibilitychange', onVisibility)
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))

watch(
  () => resultIsCurrent.value,
  async (ok) => {
    if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
    resultUrl.value = null
    if (!ok) return
    const file = await exporter.resultFile()
    if (file) resultUrl.value = URL.createObjectURL(file)
  },
  { immediate: true },
)
onBeforeUnmount(() => resultUrl.value && URL.revokeObjectURL(resultUrl.value))

async function share() {
  shareError.value = null
  const file = await exporter.resultFile()
  if (!file) {
    shareError.value = 'O arquivo exportado não foi encontrado. Exporte de novo.'
    return
  }
  try {
    if (report.value?.caps.shareFiles && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: entry.value.template.name })
      return
    }
    if (report.value?.caps.saveFilePicker) {
      const picker = (window as unknown as { showSaveFilePicker: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker
      const handle = await picker({ suggestedName: file.name, types: [{ description: 'Vídeo MP4', accept: { 'video/mp4': ['.mp4'] } }] })
      const w = await handle.createWritable()
      await w.write(file)
      await w.close()
      return
    }
    download(file)
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') shareError.value = (e as Error).message
  }
}

function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

async function downloadFile() {
  const file = await exporter.resultFile()
  if (file) download(file)
}

async function restart() {
  await exporter.discard()
}
</script>

<template>
  <main class="page">
    <section class="row head">
      <h1>Seu vídeo</h1>
      <button class="ghost small" :disabled="busy" @click="router.push({ name: 'review' })">Voltar aos takes</button>
    </section>

    <PreviewPlayer ref="preview" :entry="entry" :take-paths="takePaths" :take-durations="project.takeDurations" />

    <section class="card">
      <template v-if="resultIsCurrent && store.result">
        <h2>Pronto!</h2>
        <p class="muted">
          {{ store.result.width }}×{{ store.result.height }} · {{ formatDuration(store.result.duration) }} · {{ formatBytes(store.result.size) }}
          <template v-if="store.result.audioCodec === 'opus'"> · áudio em Opus</template>
        </p>
        <video v-if="resultUrl" class="result" :src="resultUrl" controls playsinline />
        <div class="row">
          <button data-testid="share" @click="share">{{ report?.caps.shareFiles ? 'Compartilhar' : 'Salvar vídeo' }}</button>
          <button class="ghost" @click="downloadFile">Baixar MP4</button>
          <button class="ghost" @click="restart">Exportar de novo</button>
        </div>
        <p v-if="shareError" class="error">{{ shareError }}</p>
      </template>

      <template v-else-if="busy">
        <ExportProgress :status="store.status" :progress="store.progress" />
        <p class="warn">Não saia desta tela nem bloqueie o aparelho até terminar.</p>
        <p v-if="leftDuringExport" class="muted">Você saiu da tela: se o navegador interromper, a exportação continua de onde parou ao voltar.</p>
        <p v-if="store.autoDowngraded" class="muted">O aparelho está lento para 1080p, então o vídeo sai em 720p.</p>
        <p v-if="store.benchmark" class="muted">Tempo estimado: ~{{ formatDuration(store.benchmark.estimatedTotalSeconds * (store.autoDowngraded ? 0.5 : 1)) }}</p>
        <button class="ghost" @click="exporter.cancel()">Cancelar</button>
      </template>

      <template v-else>
        <h2>Exportar MP4</h2>
        <div class="row">
          <label v-for="r in entry.template.resolutions" :key="r" class="choice">
            <input v-model="resolution" type="radio" name="resolution" :value="r" />
            {{ r }}p
          </label>
        </div>
        <p class="muted">O vídeo é montado aqui mesmo no aparelho. Se ficar lento demais em 1080p, cai para 720p automaticamente.</p>
        <p v-if="store.status === 'error'" class="error">Falhou: {{ store.error }}</p>
        <p v-if="store.status === 'canceled'" class="muted">Exportação cancelada.</p>
        <p v-for="w in report?.warnings ?? []" :key="w" class="warn">{{ w }}</p>
        <button data-testid="export" @click="exportVideo">{{ store.status === 'error' ? 'Tentar de novo' : 'Exportar vídeo' }}</button>
      </template>
    </section>
  </main>
</template>

<style scoped>
.head {
  justify-content: space-between;
}
h1,
h2 {
  margin: 0;
}
.card {
  display: grid;
  gap: 0.75rem;
}
.card p {
  margin: 0;
}
.choice {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 999px;
}
.result {
  width: 100%;
  max-height: 50vh;
  background: #000;
  border-radius: 10px;
}
</style>
