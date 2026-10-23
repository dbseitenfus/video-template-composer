import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Takeslot',
        short_name: 'Takeslot',
        description: 'Grave takes guiados por roteiro e monte o vídeo no próprio aparelho.',
        lang: 'pt-BR',
        theme_color: '#15152b',
        background_color: '#15152b',
        display: 'standalone',
        orientation: 'portrait',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wav,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Lista de templates publicados: rede primeiro, cache se estiver offline.
            urlPattern: ({ url }) => url.pathname === '/api/templates',
            handler: 'NetworkFirst',
            options: { cacheName: 'templates', networkTimeoutSeconds: 4 },
          },
          {
            // Arquivos do admin (R2) e clipes embutidos: chaves imutáveis, baixados na primeira vez
            // que são usados e guardados para uso offline. Ficam fora do precache para não baixar
            // os vídeos de todos os templates na instalação.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/assets/') || url.pathname.endsWith('.mp4'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'template-clips',
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 60 },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  // Em desenvolvimento, /api vai para o `wrangler pages dev` (npm run dev:api).
  server: { proxy: { '/api': 'http://localhost:8788' } },
  build: { target: 'es2022' },
})
