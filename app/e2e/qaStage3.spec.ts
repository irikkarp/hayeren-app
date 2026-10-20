import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { dumpUser, openWith, type Seed } from './helpers.ts'

const DATA: Seed = {
  userSets: [
    { id: 's1', title: 'Урок 5', createdAt: 1000 },
    { id: 's2', title: 'Пустой', createdAt: 2000 },
  ],
  userWords: [
    {
      id: 'u-1',
      setId: 's1',
      hy: 'բարև',
      ru: 'привет',
      translit: 'barev',
      translitAuto: false,
      createdAt: 1001,
    },
    { id: 'u-2', setId: 's1', hy: 'հաց', ru: 'хлеб', createdAt: 1002 },
  ],
}

/** Пересечения тоста с интерактивными элементами страницы (площадь > 0). */
async function toastOverlaps(page: Page) {
  return page.evaluate(() => {
    const toast = document.querySelector('.toast')
    if (!toast) return { toast: null, overlaps: [] as string[] }
    const t = toast.getBoundingClientRect()
    if (
      getComputedStyle(toast).position === 'fixed' ||
      getComputedStyle(toast).position === 'absolute'
    ) {
      return { toast: null, overlaps: ['сообщение экспорта вне потока страницы (fixed/absolute)'] }
    }
    const overlaps: string[] = []
    const sel = 'button, a, input, textarea, select, [role=button], .banner'
    for (const el of document.querySelectorAll(sel)) {
      if (toast.contains(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const w = Math.min(r.right, t.right) - Math.max(r.left, t.left)
      const h = Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top)
      if (w > 1 && h > 1) {
        overlaps.push(
          `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(w)}x${Math.round(h)}`,
        )
      }
    }
    return { toast: { top: t.top, bottom: t.bottom, height: t.height }, overlaps }
  })
}

for (const [w, h] of [
  [320, 568],
  [360, 640],
  [390, 844],
] as const) {
  test.describe(`сообщение экспорта ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } })

    test('на «Добавить слова» (экспорт из заметки) тост не перекрывает кнопки и заметку', async ({
      page,
    }) => {
      await openWith(page, DATA)
      await page.goto('/#/add')
      const dl = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Экспортировать', exact: true }).click()
      await dl
      await expect(page.getByRole('status')).toBeVisible()
      const res = await toastOverlaps(page)
      expect(res.overlaps).toEqual([])
    })

    test('в настройках тост не перекрывает кнопки', async ({ page }) => {
      await openWith(page, DATA)
      await page.goto('/#/settings')
      const dl = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Экспортировать все свои слова' }).click()
      await dl
      await expect(page.getByRole('status')).toBeVisible()
      const res = await toastOverlaps(page)
      expect(res.overlaps).toEqual([])
    })

    test('на экране набора тост не перекрывает кнопки', async ({ page }) => {
      await openWith(page, DATA)
      await page.goto('/#/sets/s1')
      const dl = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Экспортировать набор' }).click()
      await dl
      await expect(page.getByRole('status')).toBeVisible()
      const res = await toastOverlaps(page)
      expect(res.overlaps).toEqual([])
    })
  })
}

test.describe('тост экспорта: клики и навигация', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test('нажатие по кнопке «Экспортировать набор» под тостом попадает в кнопку, а не в тост', async ({
    page,
  }) => {
    await openWith(page, DATA)
    await page.goto('/#/sets/s1')
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Экспортировать набор' }).click()
    await dl
    await expect(page.getByRole('status')).toBeVisible()
    const hit = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        x.textContent?.includes('Экспортировать набор'),
      )!
      const r = b.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return b.contains(el)
    })
    expect(hit).toBe(true)
  })

  test('успешный тост не переезжает на другой экран', async ({ page }) => {
    await openWith(page, DATA)
    await page.goto('/#/settings')
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Экспортировать все свои слова' }).click()
    await dl
    await page.goto('/#/')
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    await expect(page.locator('.toast')).toHaveCount(0)
  })

  test('тост-ошибка не остаётся поверх сессии', async ({ page }) => {
    await openWith(page, DATA)
    await page.goto('/#/settings')
    await page.evaluate(() => {
      URL.createObjectURL = () => {
        throw new Error('x')
      }
    })
    await page.getByRole('button', { name: 'Экспортировать все свои слова' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await page.goto('/#/')
    await page.getByRole('link', { name: /Приветствия и вежливость/ }).click()
    await expect(page.getByRole('button', { name: 'Показать ответ' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})

test.describe('прочее', () => {
  test('двойной клик по кнопке экспорта даёт один файл', async ({ page }) => {
    await openWith(page, DATA)
    await page.goto('/#/settings')
    let n = 0
    page.on('download', () => n++)
    await page.getByRole('button', { name: 'Экспортировать все свои слова' }).dblclick()
    await page.waitForTimeout(500)
    expect(n).toBe(1)
  })
  test('удалён единственный набор со словами: кнопка недоступна', async ({ page }) => {
    await openWith(page, DATA)
    await page.goto('/#/sets/s1')
    await page.getByRole('button', { name: 'Удалить набор' }).click()
    await page.getByRole('button', { name: 'Удалить', exact: true }).click()
    await expect(page.getByText('Набор удалён')).toBeVisible()
    await page.goto('/#/settings')
    await expect(page.getByRole('button', { name: 'Экспортировать все свои слова' })).toBeDisabled()
    expect((await dumpUser(page)).words).toHaveLength(0)
  })
  test('имена: армянское и длинное название набора', async ({ page }) => {
    const long = 'Д'.repeat(40)
    await openWith(page, {
      userSets: [
        { id: 's1', title: 'Բարև աշխարհ', createdAt: 1 },
        { id: 's2', title: long, createdAt: 2 },
      ],
      userWords: [
        { id: 'a', setId: 's1', hy: 'բարև', ru: 'привет', createdAt: 3 },
        { id: 'b', setId: 's2', hy: 'բարև', ru: 'привет', createdAt: 4 },
      ],
    })
    const names: string[] = []
    for (const id of ['s1', 's2']) {
      await page.goto(`/#/sets/${id}`)
      const dl = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Экспортировать набор' }).click()
      const d = await dl
      names.push(d.suggestedFilename())
      expect(
        readFileSync(await d.path())
          .subarray(0, 3)
          .toString('hex'),
      ).toBe('efbbbf')
    }
    expect(names[0]).toBe('hayeren-words-Բարև աշխարհ-2026-10-19.csv')
  })
})

for (const scheme of ['light', 'dark'] as const) {
  test(`axe: настройки с тостом успеха и ошибки, ${scheme} 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.emulateMedia({ colorScheme: scheme })
    await openWith(page, DATA)
    await page.goto('/#/settings')
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Экспортировать все свои слова' }).click()
    await dl
    await expect(page.getByRole('status')).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'Закрыть' }).click()
    await page.evaluate(() => {
      URL.createObjectURL = () => {
        throw new Error('x')
      }
    })
    await page.getByRole('button', { name: 'Экспортировать все свои слова' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  })
}

test.describe('круг 1: fixed-тосты не перехватывают нажатия и закрываются при смене маршрута (BUG-1, BUG-2)', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test('тост смены режима: нажатие под ним доходит до элемента, при смене маршрута тост закрывается', async ({
    page,
  }) => {
    await openWith(page, DATA)
    await page.goto('/#/settings')
    await page.getByLabel(/Хочу научиться читать/).check()
    const toast = page.locator('.toast-host .toast')
    await expect(toast).toBeVisible()
    const hit = await page.evaluate(() => {
      const t = document.querySelector('.toast-host .toast')!.getBoundingClientRect()
      const el = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2)
      return {
        inside: !!el?.closest('.toast'),
        host: getComputedStyle(document.querySelector('.toast-host')!).pointerEvents,
      }
    })
    expect(hit.inside).toBe(false)
    expect(hit.host).toBe('none')
    await page.goto('/#/')
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    await expect(page.locator('.toast-host .toast')).toHaveCount(0)
  })

  test('сообщение об успехе экспорта: 10 с, потом исчезает; после ухода с экрана и возврата его нет', async ({
    page,
  }) => {
    await openWith(page, DATA)
    await page.goto('/#/settings')
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Экспортировать все свои слова' }).click()
    await dl
    await expect(page.getByRole('status')).toBeVisible()
    await page.clock.fastForward(9_000)
    await expect(page.getByRole('status')).toBeVisible()
    await page.clock.fastForward(2_000)
    await expect(page.getByRole('status')).toHaveCount(0)
  })

  test('ошибка экспорта: inline alert без «Закрыть»-перекрытия, пропадает после успешной попытки', async ({
    page,
  }) => {
    await openWith(page, DATA)
    await page.goto('/#/settings')
    await page.evaluate(() => {
      const orig = URL.createObjectURL.bind(URL)
      ;(window as unknown as { fail: boolean }).fail = true
      URL.createObjectURL = (b: Blob | MediaSource) => {
        if ((window as unknown as { fail: boolean }).fail) throw new Error('x')
        return orig(b)
      }
    })
    const btn = page.getByRole('button', { name: 'Экспортировать все свои слова' })
    await btn.click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Не удалось создать файл. Попробуйте ещё раз')
    expect(await alert.evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed')
    await page.clock.fastForward(60_000)
    await expect(alert).toBeVisible()
    await expect(page.getByText('Копия ещё не сохранялась')).toBeVisible()
    await page.evaluate(() => ((window as unknown as { fail: boolean }).fail = false))
    const dl = page.waitForEvent('download')
    await btn.click()
    await dl
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('status')).toBeVisible()
  })
})
