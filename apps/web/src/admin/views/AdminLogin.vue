<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, setToken } from '../api'

const router = useRouter()
const route = useRoute()
const token = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function login() {
  busy.value = true
  error.value = null
  try {
    await api.checkToken(token.value.trim())
    setToken(token.value.trim())
    await router.replace(typeof route.query.next === 'string' ? route.query.next : { name: 'admin-templates' })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="page narrow">
    <h1>Admin de templates</h1>
    <form class="card form" @submit.prevent="login">
      <label class="field">
        <span>Token de acesso</span>
        <input v-model="token" type="password" autocomplete="current-password" required data-testid="admin-token" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button :disabled="busy || !token">Entrar</button>
    </form>
    <p class="muted small">O token é definido no servidor (ADMIN_TOKEN) e fica salvo só nesta aba do navegador.</p>
  </main>
</template>

<style scoped>
.narrow {
  width: min(420px, 100%);
}
.form {
  display: grid;
  gap: 0.75rem;
}
.form p {
  margin: 0;
}
.small {
  font-size: 0.85rem;
}
</style>
