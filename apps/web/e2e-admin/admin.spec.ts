import { expect, test, type Page } from '@playwright/test'
import { ADMIN_TOKEN } from '../playwright.admin.config'

const sequence = (page: Page) => page.getByTestId('sequence').locator(':scope > li')

async function recordSlot(page: Page, seconds: number) {
  const button = page.getByTestId('record-button')
  await expect(button).toBeEnabled({ timeout: 15_000 })
  await button.click()
  await expect(page.getByLabel('Parar gravação')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(seconds * 1000)
  await page.getByLabel('Parar gravação').click()
  await expect(page).toHaveURL(/\/revisar$/, { timeout: 20_000 })
}

test('admin reordena vídeos pré-gravados e trechos, publica e o app usa a nova ordem', async ({ page }) => {
  page.on('console', (m) => m.type() === 'error' && console.log('[browser]', m.text()))

  // Login
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/entrar/)
  await page.getByTestId('admin-token').fill('token-errado-0000000000')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText('Token inválido')).toBeVisible()
  await page.getByTestId('admin-token').fill(ADMIN_TOKEN)
  await page.getByRole('button', { name: 'Entrar' }).click()

  // Importa os exemplos (envia assets ao R2 e publica v1)
  await page.getByRole('button', { name: 'Importar exemplos' }).click()
  await expect(page.getByText(/Importados:/)).toBeVisible({ timeout: 60_000 })
  const row = page.getByTestId('admin-template-depoimento-vertical')
  await expect(row.getByText('v1 publicada')).toBeVisible()
  await row.getByRole('button', { name: 'Editar' }).click()

  // Ordem inicial: apresentação, desafio, vinheta, resultado
  await expect(sequence(page)).toHaveCount(4)
  await expect(sequence(page).nth(2)).toHaveAttribute('data-testid', 'seq-vinheta')

  // Leva a vinheta para o começo (logo após a abertura)
  await page.getByLabel('Subir 3').click()
  await page.getByLabel('Subir 2').click()
  await expect(sequence(page).nth(0)).toHaveAttribute('data-testid', 'seq-vinheta')

  // Novo trecho gravado no fim
  await page.getByTestId('add-slot').click()
  await page.getByTestId('slot-label').fill('Recado final')
  await expect(sequence(page)).toHaveCount(5)
  await expect(sequence(page).nth(4)).toContainText('Recado final')

  await expect(page.getByTestId('editor-status')).toHaveText('Alterações não salvas')
  await page.getByTestId('publish').click()
  await expect(page.getByTestId('editor-status')).toHaveText('v2 publicada', { timeout: 20_000 })
  await expect(page.locator('aside canvas')).toBeVisible()

  // A API pública entrega a v2 com a vinheta logo após a abertura
  const published = await page.evaluate(async () => (await fetch('/api/templates')).json())
  const v2 = published.templates.find((t: { template: { id: string } }) => t.template.id === 'depoimento-vertical')
  expect(v2.version).toBe(2)
  expect(v2.template.clips[0].after).toBe('intro')
  expect(v2.template.slots.map((s: { label: string }) => s.label)).toEqual(['Quem é você', 'O desafio', 'O resultado', 'Recado final'])

  // App do usuário: grava os 4 trechos e exporta
  await page.goto('/')
  const card = page.getByTestId('template-depoimento-vertical')
  await expect(card).toContainText('4 trechos para gravar + 1 vídeo(s) pronto(s)')
  await card.getByRole('button').click()
  await recordSlot(page, 4.5)
  for (const [slot, secs] of [['desafio', 5.5], ['resultado', 4.5], ['novo-trecho', 3.5]] as const) {
    await page.getByTestId(`slot-${slot}`).getByRole('button', { name: 'Gravar' }).click()
    await recordSlot(page, secs)
  }
  await page.getByTestId('go-export').click()
  await page.getByLabel('720p').check()
  await page.getByTestId('export').click()
  await expect(page.getByRole('heading', { name: 'Pronto!' }).or(page.getByText(/^Falhou:/))).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(/^Falhou:/)).toHaveCount(0)

  const duration = await page.evaluate(async () => {
    const v = document.querySelector<HTMLVideoElement>('video.result')!
    if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }))
    return v.duration
  })
  // abertura 2,5 + vinheta 4 + ~18 de falas + encerramento 3
  expect(duration).toBeGreaterThan(25)
  expect(duration).toBeLessThan(31)
  if (process.env.SHOT_DIR) {
    await page.evaluate(async () => {
      const v = document.querySelector<HTMLVideoElement>('video.result')!
      v.pause()
      v.currentTime = 4.5
      await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
    })
    await page.waitForTimeout(300)
    await page.locator('video.result').screenshot({ path: `${process.env.SHOT_DIR}/admin-order-4.5.png` })
  }
})
