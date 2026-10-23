import { expect, test } from '@playwright/test'

// Smoke для сборки с нестандартным base (GitHub Pages: /hayeren-app/).
// Запуск: VITE_BASE=/hayeren-app/ npm run test:e2e -- basepath
// При base '/' тоже проходит.
const base = process.env.VITE_BASE ?? '/'

test('приложение, манифест и service worker работают под base', async ({ page }) => {
  await page.goto(base)
  await expect(page).toHaveTitle('Hayeren')
  await expect(page.getByRole('heading', { name: 'Как вы хотите заниматься?' })).toBeVisible()

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? ''
    const res = await fetch(href)
    return { status: res.status, json: await res.json(), href }
  })
  expect(manifest.status).toBe(200)
  expect(manifest.json.start_url).toBe(base)
  expect(manifest.json.scope).toBe(base)

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(new URL(scope).pathname).toBe(base)

  for (const file of ['sw.js', 'pwa-192x192.png', 'pwa-512x512.png', 'favicon.svg']) {
    const res = await page.request.get(`${base}${file}`)
    expect(res.status(), file).toBe(200)
  }
})
