// QA, повторная проверка (круг 1): граничные случаи после исправлений.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openWith } from './helpers.ts'

const SET = { id: 's1', title: 'Урок', createdAt: 1000 }
const noScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

for (const scheme of ['light', 'dark'] as const) {
  for (const w of [320, 360]) {
    test(`длинные данные на карточке и в заголовках, ${scheme} ${w}px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width: w, height: 640 })
      const long = 'ա'.repeat(60)
      await openWith(page, {
        userSets: [
          SET,
          { id: 's2', title: 'Д'.repeat(50), createdAt: 2000 },
          { id: 's3', title: 'Домашнее_задание_по_армянскому', createdAt: 3000 },
        ],
        userWords: [
          {
            id: 'u1',
            setId: 's1',
            hy: long,
            ru: 'я'.repeat(100),
            translit: 'x'.repeat(80),
            createdAt: 1001,
          },
          {
            id: 'u2',
            setId: 's1',
            hy: 'անհամապատասխանություն',
            ru: 'несоответствие',
            exampleHy: 'ա'.repeat(100),
            exampleRu: 'я'.repeat(200),
            createdAt: 1002,
          },
        ],
      })
      await page.goto('/#/session/set/s1')
      for (let i = 0; i < 2; i++) {
        await expect(page.locator('.hy-hero')).toBeVisible()
        expect(await noScroll(page), 'лицевая ' + i).toBe(true)
        await page.keyboard.press('Space')
        expect(await noScroll(page), 'оборот ' + i).toBe(true)
        const hero = await page.locator('.hy-hero').evaluate((e) => e.scrollWidth <= e.clientWidth)
        expect(hero).toBe(true)
        const res = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
        expect(res.violations.map((v) => v.id)).toEqual([])
        await page.keyboard.press('ArrowRight')
      }
      for (const url of [
        '/#/',
        '/#/sets/s2',
        '/#/sets/s3',
        '/#/sets/s2/edit',
        '/#/add/word?set=s2',
        '/#/add/paste',
      ]) {
        await page.goto(url)
        await page.waitForTimeout(150)
        expect(await noScroll(page), url).toBe(true)
      }
    })
  }
}

test('BUG-2: смешанный файл: строка без набора + занятое имя по умолчанию -> ошибка есть', async ({
  page,
}) => {
  await openWith(page, { userSets: [{ id: 's1', title: 'Набор от 19.10', createdAt: 1 }] })
  await page.goto('/#/add/file')
  await page.locator('input[type=file]').setInputFiles({
    name: 'm.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('set;hy;ru\nУрок 5;բարև;привет\n;հաց;хлеб\n'),
  })
  await page.getByRole('button', { name: 'Далее' }).click()
  await expect(page.getByLabel('Название нового набора')).toBeVisible()
  await page.getByRole('button', { name: /Сохранить 2/ }).click()
  await expect(page.getByText('Набор с таким названием уже есть')).toBeVisible()
})

for (const [w, h] of [
  [320, 568],
  [390, 844],
]) {
  test(`BUG-6: тост не перекрывает «Сохранить» ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await openWith(page, { userSets: [SET] })
    await page.goto('/#/add/word?set=s1')
    await page.getByLabel('Армянское слово').fill('բարև')
    await page.getByLabel('Перевод', { exact: true }).fill('привет')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByText('Слово добавлено')).toBeVisible()
    const o = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(
        (x) => x.textContent?.trim() === 'Сохранить',
      )!
      return Math.max(
        0,
        document.querySelector('.toast')!.getBoundingClientRect().bottom -
          b.getBoundingClientRect().top,
      )
    })
    expect(o, `${w}x${h}`).toBe(0)
  })
}

test('BUG-3: другие испорченные адреса', async ({ page }) => {
  await openWith(page, { userSets: [SET] })
  for (const h of [
    '/sets/s1/words/%',
    '/session/topic/%',
    '/session/set/%E0%A4%A',
    '/add/word?set=%',
  ]) {
    await page.goto('/')
    await page.evaluate((x) => (location.hash = x), h)
    await page.waitForTimeout(200)
    expect(
      await page.evaluate(() => document.getElementById('root')!.innerHTML.length),
      h,
    ).toBeGreaterThan(0)
  }
})

test('BUG-4: склонение 1/2/5 строк', async ({ page }) => {
  await openWith(page)
  for (const [n, t] of [
    [1, 'строка'],
    [2, 'строки'],
    [4, 'строки'],
    [5, 'строк'],
    [11, 'строк'],
    [21, 'строка'],
  ] as const) {
    await page.goto('/#/add/file')
    const body =
      'hy;ru\n' + Array.from({ length: n }, (_, i) => `բար${'ա'.repeat(i)};п${i}`).join('\n')
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(body) })
    const total = n + 1 // со строкой заголовка
    const shown = Math.min(total, 5)
    const word = shown === 1 ? 'строка' : shown < 5 ? 'строки' : 'строк'
    await expect(page.getByText(`первые ${shown} ${word} из ${total}`), `${n} ${t}`).toBeVisible()
  }
})

test('BUG-7/8: невидимые символы и подсказка', async ({ page }) => {
  await openWith(page)
  await page.goto('/#/add/paste')
  await page
    .getByLabel('Слова по одному на строке')
    .fill('բար​և — привет\nհաց⁤ — x\nկաթ­ — молоко\nջուր‎ — вода\nշուն — a﻿')
  await page.getByRole('button', { name: 'Разобрать' }).click()
  await expect(page.getByText(/Распознано: \d/)).toBeVisible()
  await expect(page.getByText('невидимый символ (U+2064)')).toBeVisible()
  await expect(page.getByText('Распознано: 4, с ошибками: 1')).toBeVisible()
})

// BUG-12: у пункта «Табуляция» value="\\t" (в JSX-атрибуте это два символа), файл читается одной колонкой.
test('BUG-12: S14: выбор «Табуляция» делит TSV на колонки', async ({ page }) => {
  await openWith(page)
  await page.goto('/#/add/file')
  await page.locator('input[type=file]').setInputFiles({
    name: 'd.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('հաց, նկանակ;хлеб\tx\nջուր, ըմպելիք;вода\ty\n'),
  })
  const sel = page.getByLabel('Разделитель в файле')
  await sel.selectOption({ label: 'Табуляция' })
  await expect(page.getByLabel('Роль колонки B')).toBeVisible({ timeout: 2000 })
  await expect(page.getByLabel('Роль колонки C')).toHaveCount(0)
})
