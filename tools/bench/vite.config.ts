import { defineConfig } from 'vite'

export default defineConfig({
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: { input: { bench: 'index.html', gallery: 'gallery.html' } },
  },
})
