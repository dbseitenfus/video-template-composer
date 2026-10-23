<script setup lang="ts">
import AdminNav from '../components/AdminNav.vue'
import AssetPicker from '../components/AssetPicker.vue'
</script>

<template>
  <main class="page wide">
    <AdminNav />
    <h1>Arquivos</h1>
    <p class="muted">Logos, imagens, trilhas e vídeos pré-gravados usados nos templates. Arquivos em uso não podem ser apagados.</p>
    <AssetPicker />
  </main>
</template>

<style scoped>
.wide {
  width: min(960px, 100%);
}
h1 {
  margin: 0;
}
</style>
