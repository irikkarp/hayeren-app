import AxeBuilder from '@axe-core/playwright'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { addDays, openWith, TODAY, type Seed } from './helpers.ts'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

const SEED: Seed = {
  userSets: [
    {
      id: 's1',
      title: 'Урок 5. Очень длинное название набора для проверки переноса строк',
      createdAt: 1000,
    },
    { id: 's2', title: 'Пустой', createdAt: 2000 },
  ],
  userWords: [
    { id: 'u-1', setId: 's1', hy: 'բարև', ru: 'привет', createdAt: 1001 },
    {
      id: 'u-2',
      setId: 's1',
      hy: 'շնորհակալություն',
      ru: 'спасибо большое, очень благодарен',
      translit: "shnorhakalut'yun",
      translitAuto: false,
      createdAt: 1002,
    },
  ],
  progress: [{ wordId: 'u-1', box: 4, dueDate: addDays(TODAY, 8) }],
}

async function noHScroll(page: Page) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }))
  expect(m.sw, 'horizontal scroll').toBeLessThanOrEqual(m.iw)
}

async function checkAxe(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  const msg = res.violations.map(
    (v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  )
  expect(msg, `axe on ${label}`).toEqual([])
}

async function check(page: Page, label: string) {
  await noHScroll(page)
  await checkAxe(page, label)
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [320, 360]) {
    test.describe(`свои слова: ${scheme} ${width}px`, () => {
      test.use({ colorScheme: scheme, viewport: { width, height: 640 } })

      test('главная с наборами, экран набора, диалоги', async ({ page }) => {
        await openWith(page, SEED)
        await expect(page.locator('.set-row')).toHaveCount(2)
        await check(page, 'home+sets')
        await page
          .getByRole('link', { name: /Очень длинное название/ })
          .first()
          .click()
        await expect(page.locator('.word-row')).toHaveCount(2)
        await check(page, 'set')
        await page.getByRole('button', { name: 'Удалить набор' }).click()
        await check(page, 'D3')
        await page.getByRole('button', { name: 'Отмена' }).click()
        await page.getByRole('button', { name: 'Переименовать' }).click()
        await page.getByRole('button', { name: 'Сохранить' }).click()
        await page.getByLabel('Название').fill('')
        await page.getByRole('button', { name: 'Сохранить' }).click()
        await check(page, 'D5 error')
        await page.keyboard.press('Escape')
        await page.goto('/#/sets/s2')
        await check(page, 'empty set')
      })

      test('способы добавления, вставка, предпросмотр', async ({ page }) => {
        await openWith(page, SEED)
        await page.goto('/#/add')
        await check(page, 'S09')
        await page.getByRole('link', { name: /Вставить список/ }).click()
        await check(page, 'S10')
        await page
          .getByLabel('Слова по одному на строке')
          .fill(
            'բարև — привет\nշնորհակալություն — спасибо большое\nshuka — рынок\nջուր; вода; jur\nԲարև — здравствуй',
          )
        await page.getByRole('button', { name: 'Разобрать' }).click()
        await check(page, 'S11')
        await page.getByRole('button', { name: 'авто' }).first().click()
        await check(page, 'S11 + подсказка авто')
      })

      test('форма: добавление с ошибками, изменение, дубликат, удаление', async ({ page }) => {
        await openWith(page, SEED)
        await page.goto('/#/add/word?set=s1')
        await check(page, 'S12')
        await page.getByLabel('Армянское слово').fill('կաfe')
        await page.getByLabel('Перевод', { exact: true }).fill('')
        await page.getByRole('button', { name: 'Сохранить' }).click()
        await check(page, 'S12 errors')
        await page.getByLabel('Армянское слово').fill('բարև')
        await page.getByLabel('Перевод', { exact: true }).fill('привет')
        await page.getByRole('button', { name: 'Сохранить' }).click()
        await check(page, 'D6')
        await page.getByRole('button', { name: 'Отмена' }).click()
        await page.goto('/#/sets/s1/words/u-2')
        await check(page, 'S12 edit')
        await page.getByRole('button', { name: 'Удалить слово' }).click()
        await check(page, 'D4')
      })

      test('импорт: выбор файла, колонки, предпросмотр с набором', async ({ page }) => {
        await openWith(page, SEED)
        await page.goto('/#/add/file')
        await check(page, 'S13')
        await page.locator('input[type=file]').setInputFiles(fixture('backup-format.csv'))
        await expect(page.getByRole('heading', { name: 'Что в колонках' })).toBeVisible()
        await check(page, 'S14')
        await page.getByLabel('Роль колонки B').selectOption('skip')
        await check(page, 'S14 errors')
        await page.getByLabel('Роль колонки B').selectOption('hy')
        await page.getByRole('button', { name: 'Далее' }).click()
        await check(page, 'S11 file')
      })
    })
  }
}

test('цели касания >= 44px на экранах своих слов (320px)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openWith(page, SEED)
  const small = async (label: string) => {
    const bad = await page.evaluate(() => {
      const out: string[] = []
      const els = document.querySelectorAll<HTMLElement>(
        'button, a[href], input[type=checkbox], input[type=radio], select, summary',
      )
      for (const el of els) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (el.closest('.sr-only')) continue
        // чекбокс обёрнут в метку с целью 44px
        const target = el instanceof HTMLInputElement ? (el.closest('label') ?? el) : el
        const t = target.getBoundingClientRect()
        // «авто» — вспомогательная метка, как и в сессии: цель 24px допустима по WCAG 2.2 (2.5.8)
        if (el.classList.contains('chip')) continue
        if (t.height < 43.5 || t.width < 43.5) {
          out.push(
            `${el.tagName} ${el.textContent?.trim().slice(0, 30)} ${Math.round(t.width)}x${Math.round(t.height)}`,
          )
        }
      }
      return out
    })
    expect(bad, label).toEqual([])
  }
  await small('home')
  await page.goto('/#/sets/s1')
  await small('set')
  await page.goto('/#/add')
  await small('S09')
  await page.goto('/#/add/word')
  await small('S12')
})
