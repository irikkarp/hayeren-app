// Renders ../docs/design/icon.svg into PNG/ICO files in public/ using Playwright Chromium.
// Usage: npm run icons
import { chromium } from '@playwright/test'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = resolve(root, '../docs/design/icon.svg')
const out = (name) => resolve(root, 'public', name)
const svg = readFileSync(svgPath, 'utf8')

// The source icon is full-bleed and keeps the drawing inside the 80% safe zone,
// so the same render serves both "any" and "maskable".
const targets = [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['pwa-maskable-512x512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32x32.png', 32],
  ['favicon-48x48.png', 48],
]

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  for (const [name, size] of targets) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<style>html,body{margin:0}img{display:block;width:${size}px;height:${size}px}</style><img src="${dataUrl}">`,
    )
    await page.waitForFunction(() => document.images[0].complete)
    await page.screenshot({ path: out(name), clip: { x: 0, y: 0, width: size, height: size } })
    console.log('wrote', name)
  }
} finally {
  await browser.close()
}

// favicon.ico with embedded PNGs (32 and 48)
const pngs = [32, 48].map((s) => [s, readFileSync(out(`favicon-${s}x${s}.png`))])
const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(pngs.length, 4)
let offset = 6 + 16 * pngs.length
const dirs = pngs.map(([s, buf]) => {
  const d = Buffer.alloc(16)
  d[0] = s
  d[1] = s
  d.writeUInt16LE(1, 4)
  d.writeUInt16LE(32, 6)
  d.writeUInt32LE(buf.length, 8)
  d.writeUInt32LE(offset, 12)
  offset += buf.length
  return d
})
writeFileSync(out('favicon.ico'), Buffer.concat([header, ...dirs, ...pngs.map(([, b]) => b)]))
copyFileSync(svgPath, out('favicon.svg'))
console.log('wrote favicon.ico, favicon.svg')
