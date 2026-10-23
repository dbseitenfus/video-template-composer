<script setup lang="ts">
import { useRouter } from 'vue-router'
import { setToken } from '../api'

const router = useRouter()
function logout() {
  setToken(null)
  void router.push({ name: 'admin-login' })
}
</script>

<template>
  <nav class="row nav" aria-label="Admin">
    <strong>Admin</strong>
    <RouterLink :to="{ name: 'admin-templates' }">Templates</RouterLink>
    <RouterLink :to="{ name: 'admin-assets' }">Arquivos</RouterLink>
    <RouterLink to="/" target="_blank">Ver app</RouterLink>
    <button class="ghost small" @click="logout">Sair</button>
  </nav>
</template>

<style scoped>
.nav {
  gap: 1rem;
}
.nav a {
  color: var(--muted);
  text-decoration: none;
  font-weight: 600;
}
.nav a.router-link-active {
  color: var(--text);
}
.nav button {
  margin-left: auto;
}
</style>
