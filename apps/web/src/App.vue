<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from './stores/project'

const route = useRoute()
const project = useProjectStore()
const fullscreen = computed(() => route.name === 'record')
const admin = computed(() => !!route.meta.admin)
const steps = [
  { name: 'home', label: 'Template' },
  { name: 'record', label: 'Gravar' },
  { name: 'review', label: 'Revisar' },
  { name: 'export', label: 'Exportar' },
]
const current = computed(() => steps.findIndex((s) => s.name === route.name))
</script>

<template>
  <header v-if="!fullscreen" class="topbar">
    <RouterLink to="/" class="brand">takeslot</RouterLink>
    <ol v-if="project.template && !admin" class="steps" aria-label="Etapas">
      <li v-for="(step, i) in steps" :key="step.name" :class="{ done: i < current, current: i === current }">{{ step.label }}</li>
    </ol>
  </header>
  <RouterView />
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: calc(0.75rem + env(safe-area-inset-top)) 1rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.brand {
  color: var(--text);
  font-weight: 800;
  font-size: 1.15rem;
  text-decoration: none;
}
.steps {
  display: flex;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
  color: var(--muted);
}
.steps .done {
  color: var(--ok);
}
.steps .current {
  color: var(--text);
  font-weight: 700;
}
@media (max-width: 420px) {
  .steps li:not(.current) {
    display: none;
  }
}
</style>
