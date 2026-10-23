<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CameraView from '../components/CameraView.vue'
import Teleprompter from '../components/Teleprompter.vue'
import { useCamera } from '../composables/useCamera'
import { useRecorder } from '../composables/useRecorder'
import { useWakeLock } from '../composables/useWakeLock'
import { useProjectStore } from '../stores/project'
import { captureThumbnail } from '../lib/media'
import { formatDuration } from '../lib/format'
import { reportError } from '../lib/telemetry'

const route = useRoute()
const router = useRouter()
const project = useProjectStore()
const camera = useCamera()
const recorder = useRecorder()
const wakeLock = useWakeLock()

const cameraView = ref<InstanceType<typeof CameraView> | null>(null)
const countdown = ref(0)
const saving = ref(false)
const failure = ref<string | null>(null)

const template = computed(() => project.template!)
const slot = computed(() => template.value.slots.find((s) => s.id === route.params.slot)!)
const slotIndex = computed(() => template.value.slots.indexOf(slot.value))
const aspect = computed(() => template.value.canvas.width / template.value.canvas.height)
const remaining = computed(() => Math.max(0, slot.value.maxDuration - recorder.elapsed.value))
const tooShort = computed(() => recorder.recording.value && recorder.elapsed.value < slot.value.minDuration)

const cameraMessage = computed(() => {
  switch (camera.error.value) {
    case 'denied':
      return 'Sem permissão para usar a câmera e o microfone. Libere o acesso nas configurações do navegador e tente de novo.'
    case 'not-found':
      return 'Nenhuma câmera encontrada neste aparelho.'
    case 'in-use':
      return 'A câmera está sendo usada por outro app. Feche-o e tente de novo.'
    case 'unknown':
      return 'Não foi possível abrir a câmera.'
    default:
      return null
  }
})

onMounted(() => camera.start())

// Para sozinho no tempo máximo do slot.
watch(remaining, (r) => {
  if (recorder.recording.value && r <= 0) void stop()
})

async function begin() {
  if (!camera.stream.value) return
  failure.value = null
  void wakeLock.request()
  for (countdown.value = 3; countdown.value > 0; countdown.value--) await new Promise((r) => setTimeout(r, 1000))
  try {
    await recorder.start(camera.stream.value)
  } catch (e) {
    failure.value = (e as Error).message
    reportError(e, { phase: 'record-start' })
  }
}

async function stop() {
  if (!recorder.recording.value || saving.value) return
  saving.value = true
  const thumbnail = cameraView.value?.video ? captureThumbnail(cameraView.value.video) : null
  try {
    const take = await recorder.stop()
    if (take) {
      await project.saveTake({ ...take, slotId: slot.value.id, createdAt: Date.now(), thumbnail })
      await wakeLock.release()
      await router.push({ name: 'review' })
    }
  } catch (e) {
    failure.value = (e as Error).message
    reportError(e, { phase: 'record-stop' })
  } finally {
    saving.value = false
  }
}

async function back() {
  if (recorder.recording.value) await recorder.cancel()
  await router.push({ name: 'review' })
}
</script>

<template>
  <main class="record">
    <CameraView ref="cameraView" :stream="camera.stream.value" :mirrored="camera.facing.value === 'user'" :aspect="aspect">
      <div class="top">
        <div class="bar">
          <button class="ghost small on-video" :disabled="saving" @click="back">Voltar</button>
          <span class="slot-name">{{ slotIndex + 1 }}/{{ template.slots.length }} · {{ slot.label }}</span>
          <button class="ghost small on-video" :disabled="recorder.recording.value || countdown > 0" @click="camera.switchCamera()">Virar</button>
        </div>
        <Teleprompter :script="slot.script" :active="recorder.recording.value" />
      </div>

      <div v-if="countdown > 0" class="countdown" aria-live="assertive">{{ countdown }}</div>
      <div v-if="cameraMessage" class="center-message">
        <p>{{ cameraMessage }}</p>
        <button @click="camera.start()">Tentar de novo</button>
      </div>

      <div class="bottom">
        <p v-if="failure" class="error">{{ failure }}</p>
        <p v-else-if="recorder.recording.value" class="timer" :class="{ warn: tooShort }">
          ● {{ formatDuration(recorder.elapsed.value) }} <small>/ {{ formatDuration(slot.maxDuration) }}</small>
          <small v-if="tooShort"> · mínimo {{ slot.minDuration }} s</small>
        </p>
        <p v-else class="hint">Até {{ formatDuration(slot.maxDuration) }}. O roteiro rola sozinho durante a gravação.</p>
        <button
          class="rec"
          :class="{ stop: recorder.recording.value }"
          :disabled="!camera.stream.value || countdown > 0 || saving"
          :aria-label="recorder.recording.value ? 'Parar gravação' : 'Começar a gravar'"
          data-testid="record-button"
          @click="recorder.recording.value ? stop() : begin()"
        />
      </div>
    </CameraView>
  </main>
</template>

<style scoped>
.record {
  position: fixed;
  inset: 0;
  background: #000;
  color: #fff;
}
.top {
  position: absolute;
  inset: 0 0 auto;
  padding-top: env(safe-area-inset-top);
}
.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgb(0 0 0 / 0.72);
}
.slot-name {
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
}
.on-video {
  color: #fff;
}
.bottom {
  position: absolute;
  inset: auto 0 0;
  padding: 1rem 1rem calc(1.25rem + env(safe-area-inset-bottom));
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  background: linear-gradient(transparent, rgb(0 0 0 / 0.7));
}
.bottom p {
  margin: 0;
  text-align: center;
}
.timer {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.timer::first-letter {
  color: var(--danger);
}
.hint {
  font-size: 0.85rem;
  opacity: 0.85;
}
.rec {
  width: 74px;
  height: 74px;
  padding: 0;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 0 5px rgb(255 255 255 / 0.85);
  transition: border-radius 0.15s;
}
.rec.stop {
  border-radius: 14px;
  transform: scale(0.75);
}
.countdown {
  position: absolute;
  font-size: 7rem;
  font-weight: 800;
  text-shadow: 0 4px 30px rgb(0 0 0 / 0.6);
}
.center-message {
  position: absolute;
  max-width: 320px;
  text-align: center;
  display: grid;
  gap: 1rem;
  justify-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 0.7);
  border-radius: 14px;
}
</style>
