import { defineConfig, devices } from '@playwright/test'

/**
 * E2E do admin contra o backend real rodando localmente (wrangler: Pages Functions + D1 + R2 simulados).
 * Usa um estado isolado em .wrangler/e2e-state, apagado a cada execução.
 */
export const ADMIN_TOKEN = 'e2e-admin-token-0123456789'
const state = '.wrangler/e2e-state'

export default defineConfig({
  testDir: 'e2e-admin',
  timeout: 300_000,
  use: { baseURL: 'http://localhost:8789', permissions: ['camera', 'microphone'] },
  webServer: {
    command: [
      `rm -rf ${state}`,
      'npx vite build',
      `npx wrangler d1 migrations apply takeslot --local --persist-to ${state}`,
      `npx wrangler pages dev dist --port 8789 --persist-to ${state} --binding ADMIN_TOKEN=${ADMIN_TOKEN}`,
    ].join(' && '),
    port: 8789,
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PW_CHANNEL,
        launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
      },
    },
  ],
})
