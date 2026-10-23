import { computed, ref } from 'vue'
import { api, type Asset } from './api'

/** Biblioteca de arquivos compartilhada entre as telas do admin (uma lista só, atualizada após cada envio). */
const assets = ref<Asset[]>([])
let loading: Promise<void> | null = null

async function refresh() {
  loading = api.listAssets().then((list) => {
    assets.value = list
  })
  await loading
}

const byKey = computed(() => Object.fromEntries(assets.value.map((a) => [a.key, a])) as Record<string, Asset>)
const names = computed(() => Object.fromEntries(assets.value.map((a) => [a.key, a.name])) as Record<string, string>)

export function useLibrary() {
  return {
    assets,
    byKey,
    names,
    refresh,
    /** Carrega uma vez; chamadas seguintes reaproveitam a lista. */
    ensure: () => loading ?? refresh(),
  }
}
