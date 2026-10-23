import { expect, test, type Page } from '@playwright/test'

async function recordSlot(page: Page, seconds: number) {
  const button = page.getByTestId('record-button')
  await expect(button).toBeEnabled({ timeout: 15_000 })
  await button.click()
  await expect(page.getByLabel('Parar gravação')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(seconds * 1000)
  await page.getByLabel('Parar gravação').click()
  await expect(page).toHaveURL(/\/revisar$/, { timeout: 20_000 })
}

test('grava os trechos, monta e exporta um MP4', async ({ page }) => {
  page.on('console', (m) => m.type() === 'error' && console.log('[browser]', m.text()))
  await page.goto('/')
  await page.getByTestId('template-depoimento-vertical').getByRole('button').click()
  await expect(page).toHaveURL(/\/gravar\/apresentacao$/)

  await recordSlot(page, 4.5)
  for (const slot of ['desafio', 'resultado']) {
    await page.getByTestId(`slot-${slot}`).getByRole('button', { name: 'Gravar' }).click()
    await recordSlot(page, slot === 'desafio' ? 5.5 : 4.5)
  }

  await page.getByTestId('go-export').click()
  await expect(page).toHaveURL(/\/exportar$/)
  await page.getByLabel('720p').check()
  await page.getByTestId('export').click()
  await expect(page.getByRole('heading', { name: 'Pronto!' }).or(page.getByText(/^Falhou:/))).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(/^Falhou:/)).toHaveCount(0)

  const info = await page.evaluate(async () => {
    const v = document.querySelector<HTMLVideoElement>('video.result')!
    if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }))
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight }
  })
  expect(info.width).toBe(720)
  expect(info.height).toBe(1280)
  // abertura 2,5 + ~14,5 de falas + encerramento 3
  expect(info.duration).toBeGreaterThan(17)
  expect(info.duration).toBeLessThan(23)

  // Retomada: recarrega a página no meio da exportação (como o iOS descartando a aba).
  await page.getByRole('button', { name: 'Exportar de novo' }).click()
  await page.getByLabel('1080p').check()
  await page.getByTestId('export').click()
  await expect(page.getByText(/parte 2 de/)).toBeVisible({ timeout: 60_000 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pronto!' })).toBeVisible({ timeout: 90_000 })
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('takeslot:export') ?? '{}'))
  expect(saved.result.resumedChunks).toBeGreaterThanOrEqual(1)
  expect(saved.result.height).toBe(1920)
})
