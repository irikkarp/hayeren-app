import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
// Для проверки сборки под подпутём (GitHub Pages): VITE_BASE=/hayeren-app/ npm run test:e2e -- basepath
const BASE = process.env.VITE_BASE ?? '/'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'allow',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // e2e гоняется на production-сборке (build + preview), чтобы проверять и PWA
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
