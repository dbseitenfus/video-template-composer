<script setup lang="ts">
import { ref, toRef, watch } from 'vue'
import { useTeleprompter } from '../composables/useTeleprompter'

const props = defineProps<{
  script: string
  /** Rola sozinho enquanto `active` for verdadeiro (durante a gravação). */
  active: boolean
}>()

const container = ref<HTMLElement | null>(null)
const prompter = useTeleprompter(container, toRef(props, 'script'))

watch(
  () => props.active,
  (active) => (active ? prompter.play() : prompter.pause()),
)
watch(
  () => props.script,
  () => prompter.reset(),
)

defineExpose({ reset: prompter.reset })
</script>

<template>
  <div class="teleprompter">
    <div ref="container" class="scroll" data-testid="teleprompter-text">
      <p v-for="(line, i) in script.split('\n')" :key="i">{{ line }}</p>
    </div>
    <div class="speed">
      <button class="ghost small" aria-label="Mais devagar" @click="prompter.adjustSpeed(-20)">−</button>
      <span>{{ prompter.wordsPerMinute.value }} ppm</span>
      <button class="ghost small" aria-label="Mais rápido" @click="prompter.adjustSpeed(20)">+</button>
    </div>
  </div>
</template>

<style scoped>
.teleprompter {
  position: relative;
  background: linear-gradient(rgb(0 0 0 / 0.72), rgb(0 0 0 / 0.5));
  color: #fff;
  border-radius: 0 0 16px 16px;
}
.scroll {
  max-height: 32vh;
  overflow-y: auto;
  padding: 1rem 1.25rem 30vh;
  font-size: clamp(1.25rem, 5vw, 1.9rem);
  line-height: 1.4;
  font-weight: 600;
  scrollbar-width: none;
  mask-image: linear-gradient(transparent, #000 12%, #000 75%, transparent);
}
.scroll p {
  margin: 0 0 0.6em;
}
.speed {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  opacity: 0.85;
}
</style>
