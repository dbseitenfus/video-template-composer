<script setup lang="ts">
import { ref } from 'vue'
import type { Asset, AssetKind } from '../api'
import AssetPicker from './AssetPicker.vue'
import Modal from './Modal.vue'

/** Campo que referencia um arquivo da biblioteca (guarda a chave do arquivo). */
const props = defineProps<{ kind: AssetKind; label: string; names: Record<string, string> }>()
const model = defineModel<string | undefined>()
const emit = defineEmits<{ picked: [asset: Asset] }>()
const open = ref(false)

function pick(asset: Asset) {
  model.value = asset.key
  emit('picked', asset)
  open.value = false
}
</script>

<template>
  <div class="field">
    <span>{{ label }}</span>
    <div class="row">
      <span class="name">{{ model ? (props.names[model] ?? model) : 'Nenhum arquivo' }}</span>
      <button class="ghost small" type="button" @click="open = true">{{ model ? 'Trocar' : 'Escolher' }}</button>
    </div>
    <Modal v-if="open" :title="label" @close="open = false">
      <AssetPicker :kind="kind" selectable @select="pick" />
    </Modal>
  </div>
</template>

<style scoped>
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
</style>
