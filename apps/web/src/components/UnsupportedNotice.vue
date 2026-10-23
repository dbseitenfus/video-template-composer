<script setup lang="ts">
defineProps<{ blockers: string[] }>()
</script>

<template>
  <section class="notice" role="alert">
    <h2>Este navegador não consegue montar o vídeo</h2>
    <ul>
      <li v-for="b in blockers" :key="b">{{ b }}</li>
    </ul>
    <p>Use o Chrome ou o Edge atualizados, o Safari 26 ou mais novo no iPhone, ou o Firefox no computador.</p>
  </section>
</template>

<style scoped>
.notice {
  background: color-mix(in srgb, var(--danger) 14%, var(--surface));
  border: 1px solid var(--danger);
  border-radius: 14px;
  padding: 1rem 1.25rem;
}
h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}
ul {
  margin: 0 0 0.5rem;
  padding-left: 1.2rem;
}
p {
  margin: 0;
  color: var(--muted);
}
</style>
