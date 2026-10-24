import { expect, test, type Page } from '@playwright/test'
import { addDays, dont, ids, know, openWith, type Seed, type SeedProgress } from './helpers.ts'

// QA «Видимый прогресс» (001 ред. 11, кр. 149–167): даты, бар, склонения, граничные случаи.
const note = (page: Page) => page.locator('#review-note')
const topicRow = (page: Page, name: string) => page.locator('.list .row', { hasText: name }).first()
const SHOTS = '../docs/qa/screens'

async function noteFor(page: Page, today: Date, dueDate: string) {
  await openWith(page, { progress: [{ wordId: 'shop-01', box: 5, dueDate }] }, today)
  return note(page).textContent()
}

test.describe('Даты ближайшего повторения при подменённых часах (157–158)', () => {
  const cases: [string, Date, string, string][] = [
    ['завтра', new Date(2026, 9, 24, 12), '2026-10-25', 'Следующее повторение — завтра'],
    ['послезавтра', new Date(2026, 9, 24, 12), '2026-10-26', 'Следующее повторение — послезавтра'],
    ['27 октября', new Date(2026, 9, 24, 12), '2026-10-27', 'Следующее повторение — 27 октября'],
    [
      'конец года: завтра',
      new Date(2026, 11, 30, 12),
      '2026-12-31',
      'Следующее повторение — завтра',
    ],
    [
      'конец года: послезавтра',
      new Date(2026, 11, 30, 12),
      '2027-01-01',
      'Следующее повторение — послезавтра',
    ],
    [
      'конец года: с годом',
      new Date(2026, 11, 30, 12),
      '2027-01-05',
      'Следующее повторение — 5 января 2027',
    ],
    ['29 февраля', new Date(2028, 1, 26, 12), '2028-02-29', 'Следующее повторение — 29 февраля'],
    [
      '28 февраля -> 1 марта = послезавтра',
      new Date(2028, 1, 28, 12),
      '2028-03-01',
      'Следующее повторение — послезавтра',
    ],
    [
      '29 февраля -> 1 марта = завтра',
      new Date(2028, 1, 29, 12),
      '2028-03-01',
      'Следующее повторение — завтра',
    ],
    [
      '5 числа без ведущего нуля',
      new Date(2026, 9, 24, 12),
      '2026-11-05',
      'Следующее повторение — 5 ноября',
    ],
  ]
  for (const [name, now, due, expected] of cases) {
    test(name, async ({ page }) => {
      expect(await noteFor(page, now, due)).toBe(expected)
    })
  }

  test('поздний вечер 23:59: «завтра» не превращается в «сегодня» (157)', async ({ page }) => {
    expect(await noteFor(page, new Date(2026, 9, 24, 23, 59), '2026-10-25')).toBe(
      'Следующее повторение — завтра',
    )
  })

  test('переход через полночь: текст пересчитывается без перезагрузки (162)', async ({ page }) => {
    await openWith(
      page,
      { progress: [{ wordId: 'shop-01', box: 4, dueDate: '2026-10-20' }] },
      new Date(2026, 9, 19, 23, 59, 30),
    )
    await expect(note(page)).toHaveText('Следующее повторение — завтра')
    await page.clock.fastForward(60_000)
    await expect(page.getByRole('button', { name: 'Повторить (1)' })).toBeEnabled()
    await expect(note(page)).toHaveCount(0)
  })
})

test.describe('Бар: ширины, минимум 8 px, зазор (151)', () => {
  test.use({ viewport: { width: 320, height: 640 } })
  const mk = (n: number): Seed['userWords'] =>
    Array.from({ length: n }, (_, i) => ({
      id: `u-${i}`,
      setId: 's1',
      hy: `բառ${i}`,
      ru: `слово ${i}`,
      createdAt: 1 + i,
    }))

  test('N = 3000: 1 выучено + 1 в изучении — оба сегмента ≥ 8 px, зазор 2 px, сумма ≤ трека', async ({
    page,
  }) => {
    const seed: Seed = {
      userSets: [{ id: 's1', title: 'Большой', createdAt: 1 }],
      userWords: mk(3000),
      progress: [
        { wordId: 'u-0', box: 4, dueDate: '2026-11-30' },
        { wordId: 'u-1', box: 2, dueDate: '2026-11-30' },
      ],
    }
    await openWith(page, seed)
    const row = page.locator('.set-row', { hasText: 'Большой' })
    await expect(row.locator('.pl')).toHaveText('выучено 1 · в изучении 1 из 3000')
    const b = (await row.getByRole('progressbar').boundingBox())!
    const l = (await row.locator('.seg-l').boundingBox())!
    const i = (await row.locator('.seg-i').boundingBox())!
    expect(l.width).toBeGreaterThanOrEqual(8)
    expect(i.width).toBeGreaterThanOrEqual(8)
    expect(i.x - (l.x + l.width)).toBeCloseTo(2, 0)
    expect(i.x + i.width).toBeLessThanOrEqual(b.x + b.width + 0.5)
  })

  test('N = 3000: 2999 в изучении + 1 выучено — сумма не выходит за трек', async ({ page }) => {
    const progress: SeedProgress[] = [{ wordId: 'u-0', box: 4, dueDate: '2026-11-30' }]
    for (let n = 1; n < 3000; n++)
      progress.push({ wordId: `u-${n}`, box: 2, dueDate: '2026-11-30' })
    await openWith(page, {
      userSets: [{ id: 's1', title: 'Большой', createdAt: 1 }],
      userWords: mk(3000),
      progress,
    })
    const row = page.locator('.set-row', { hasText: 'Большой' })
    const b = (await row.getByRole('progressbar').boundingBox())!
    const l = (await row.locator('.seg-l').boundingBox())!
    const i = (await row.locator('.seg-i').boundingBox())!
    expect(l.width).toBeGreaterThanOrEqual(8)
    expect(i.x + i.width).toBeLessThanOrEqual(b.x + b.width + 0.5)
  })

  test('N = 1, слово выучено: сегмент во весь трек, без «в изучении»', async ({ page }) => {
    await openWith(page, {
      userSets: [{ id: 's1', title: 'Один', createdAt: 1 }],
      userWords: mk(1),
      progress: [{ wordId: 'u-0', box: 4, dueDate: '2026-11-30' }],
    })
    const row = page.locator('.set-row', { hasText: 'Один' })
    await expect(row.locator('.pl')).toHaveText('выучено 1 из 1')
    await expect(row.locator('.seg-i')).toHaveCount(0)
  })
})

test.describe('Склонение «осталось K новых слов» и досрочное завершение (155, 165в)', () => {
  const forms: [number, string][] = [
    [1, 'осталось 1 новое слово.'],
    [2, 'осталось 2 новых слова.'],
    [4, 'осталось 4 новых слова.'],
    [5, 'осталось 5 новых слов.'],
    [11, 'осталось 11 новых слов.'],
    [12, 'осталось 12 новых слов.'],
    [14, 'осталось 14 новых слов.'],
  ]
  for (const [k, text] of forms) {
    test(`тема, K = ${k}, «Завершить» без ответов (m = 0)`, async ({ page }) => {
      const progress: SeedProgress[] = ids('greetings', 1, 15 - k).map((wordId) => ({
        wordId,
        box: 4,
        dueDate: '2026-11-30',
      }))
      await openWith(page, { progress })
      await page.getByRole('link', { name: /Приветствия и вежливость/ }).click()
      await page.getByRole('button', { name: 'Завершить' }).click()
      const ex = page.locator('.explain')
      await expect(ex).toContainText(`В теме «Приветствия и вежливость» ${text}`)
      await expect(ex).not.toContainText('Новых слов в изучении')
      await expect(ex).toContainText('Следующее повторение')
    })
  }

  test('набор, K = 21 и 22, 25: склонение', async ({ page }) => {
    for (const [k, text] of [
      [21, '21 новое слово'],
      [22, '22 новых слова'],
      [25, '25 новых слов'],
    ] as const) {
      const ctx = await page.context().browser()!.newContext()
      const p = await ctx.newPage()
      await openWith(p, {
        userSets: [{ id: 's1', title: 'Набор', createdAt: 1 }],
        userWords: Array.from({ length: k }, (_, i) => ({
          id: `u-${i}`,
          setId: 's1',
          hy: `բառ${i}`,
          ru: `с${i}`,
          createdAt: 1 + i,
        })),
      })
      await p.locator('.set-row', { hasText: 'Набор' }).locator('.set-main').click()
      await p.getByRole('link', { name: 'Учить', exact: true }).click()
      await p.getByRole('button', { name: 'Завершить' }).click()
      await expect(p.locator('.explain')).toContainText(`В наборе «Набор» осталось ${text}.`)
      // ничего не начато: строки про дату нет (156)
      await expect(p.locator('.explain')).not.toContainText('Следующее повторение')
      await ctx.close()
    }
  })

  test('3 «Знаю» и «Завершить»: блок по данным ответам', async ({ page }) => {
    await openWith(page)
    await page.getByRole('link', { name: /Приветствия и вежливость/ }).click()
    for (let i = 0; i < 3; i++) await know(page)
    await page.getByRole('button', { name: 'Завершить' }).click()
    await expect(page.getByRole('heading', { name: 'Сессия остановлена' })).toBeVisible()
    const ex = page.locator('.explain')
    await expect(ex).toContainText('Новых слов в изучении: 3.')
    await expect(ex).toContainText('через 2 дня и ещё через 4')
    await expect(ex).toContainText('осталось 12 новых слов.')
  })

  test('смесь 5 «Знаю» + 5 «Не знаю»: схема обещается; повторы из другой темы не считаются (165а)', async ({
    page,
  }) => {
    await openWith(page, {
      progress: ids('shop', 1, 3).map((wordId) => ({ wordId, box: 2, dueDate: '2026-10-19' })),
    })
    await page.getByRole('link', { name: /Приветствия и вежливость/ }).click()
    // очередь: 3 просроченных повторения + 10 новых; отвечаем «Знаю» на всё, что показано, до итога
    for (let i = 0; i < 13; i++) {
      if (i < 8) await know(page)
      else await dont(page)
    }
    // «Не знаю» возвращает слова в очередь — добиваем «Знаю»
    for (let guard = 0; guard < 10; guard++) {
      if (await page.locator('.explain').isVisible()) break
      await know(page)
    }
    const ex = page.locator('.explain')
    await expect(ex).toContainText('Новых слов в изучении: 10.')
    await expect(ex).toContainText('через 2 дня и ещё через 4')
  })
})

test.describe('Плитки, N = 0, склонение «слов» (153, 159)', () => {
  for (const [n, word] of [
    [1, 'слово'],
    [2, 'слова'],
    [5, 'слов'],
    [21, 'слово'],
  ] as const) {
    test(`N = ${n}: «${word}», текста даты нет`, async ({ page }) => {
      const progress = [
        ...ids('greetings', 1, Math.min(n, 15)),
        ...ids('numbers', 1, Math.max(0, n - 15)),
      ].map((wordId) => ({
        wordId,
        box: 2,
        dueDate: '2026-10-19',
      }))
      await openWith(page, { progress })
      const tile = page.locator('.stat', { hasText: 'Повторить сегодня' })
      await expect(tile.locator('.sub').first()).toHaveText(word)
      await expect(tile.locator('.nextrev')).toHaveCount(0)
      await expect(note(page)).toHaveCount(0)
    })
  }

  test('N = 0 и есть состояния: плитка «0 слов» + дата, кнопка disabled, нажатие ничего не делает', async ({
    page,
  }) => {
    await openWith(page, { progress: [{ wordId: 'shop-01', box: 3, dueDate: '2026-10-21' }] })
    const tile = page.locator('.stat', { hasText: 'Повторить сегодня' })
    await expect(tile).toContainText('слов')
    await expect(tile.locator('.nextrev')).toHaveText('Следующее повторение — послезавтра')
    await page.getByRole('button', { name: 'Повторить (0)' }).click({ force: true })
    await expect(page).toHaveURL(/#\/$/)
  })

  test('«Сбросить прогресс»: всё как в начале (163г)', async ({ page }) => {
    await openWith(page, {
      progress: [
        ...ids('greetings', 1, 3).map((wordId) => ({ wordId, box: 4, dueDate: '2026-11-30' })),
        { wordId: 'shop-01', box: 2, dueDate: '2026-10-21' },
      ],
    })
    await page.getByRole('link', { name: /Настройки/ }).click()
    await page.getByRole('button', { name: 'Сбросить прогресс' }).click()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await expect(page.getByText('Прогресс сброшен')).toBeVisible()
    await page.goto('/#/')
    await expect(topicRow(page, 'Приветствия').locator('.pl')).toHaveText('выучено 0 из 15')
    await expect(page.locator('.stat', { hasText: 'Выучено' })).toContainText('в изучении 0')
    await expect(note(page)).toHaveText('Пока нечего повторять: начните с любой темы')
  })

  test('лимит новых слов исчерпан: экран не меняется, строки «Следующее повторение» нет (165г)', async ({
    page,
  }) => {
    await openWith(page, {
      days: [{ date: '2026-10-19', answered: 10, newStarted: 10 }],
      progress: ids('greetings', 1, 10).map((wordId) => ({
        wordId,
        box: 2,
        dueDate: '2026-10-21',
      })),
    })
    await page.getByRole('link', { name: /Приветствия и вежливость/ }).click()
    await expect(page.getByText('На сегодня новых слов достаточно')).toBeVisible()
    await expect(page.getByText('Следующее повторение')).toHaveCount(0)
  })
})

test.describe('Различимость без цвета: скриншоты (152)', () => {
  const progress: SeedProgress[] = [
    ...ids('greetings', 1, 5).map((wordId) => ({
      wordId,
      box: 4,
      dueDate: addDays('2026-10-19', 8),
    })),
    ...ids('greetings', 6, 11).map((wordId) => ({
      wordId,
      box: 2,
      dueDate: addDays('2026-10-19', 2),
    })),
  ]
  for (const scheme of ['light', 'dark'] as const) {
    test(`оттенки серого, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width: 390, height: 900 })
      await openWith(page, { progress })
      await page.addStyleTag({ content: 'html{filter:grayscale(1)}' })
      await topicRow(page, 'Приветствия').screenshot({
        path: `${SHOTS}/progress-gray-${scheme}-row.png`,
      })
      await page.screenshot({ path: `${SHOTS}/progress-gray-${scheme}-home.png` })
    })
  }
})

// Исходный сценарий владельца: до / после, светлая и тёмная тема, 320 и 390 px.
for (const scheme of ['light', 'dark'] as const) {
  for (const width of [320, 390]) {
    test(`сценарий владельца ${scheme} ${width}: скриншоты до и после`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width, height: 844 })
      const tag = `${scheme}-${width}`
      await openWith(page)
      await page.screenshot({ path: `${SHOTS}/progress-${tag}-1-home-before.png`, fullPage: true })
      await page.getByRole('link', { name: /Приветствия и вежливость/ }).click()
      for (let i = 0; i < 10; i++) await know(page)
      await expect(page.locator('.explain')).toBeVisible()
      await page.screenshot({ path: `${SHOTS}/progress-${tag}-2-result.png`, fullPage: true })
      await page.getByRole('button', { name: 'К темам' }).click()
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
      await page.screenshot({ path: `${SHOTS}/progress-${tag}-3-home-after.png`, fullPage: true })
      const sw = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(sw).toBeLessThanOrEqual(width)
    })
  }
}

// axe: экран набора с баром, главная при N = 0 и S04b, обе темы, 320 px
import AxeBuilder from '@axe-core/playwright'
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe прогресс ${scheme} 320`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 320, height: 640 } })
    const check = async (page: Page, label: string) => {
      const res = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(
        res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
        label,
      ).toEqual([])
      const sw = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(sw, `${label}: горизонтальный скролл`).toBeLessThanOrEqual(320)
    }
    test('экран набора, главная N = 0 (дата), S04b', async ({ page }) => {
      await openWith(page, {
        userSets: [{ id: 's1', title: 'Набор', createdAt: 1 }],
        userWords: [1, 2, 3].map((n) => ({
          id: `u-${n}`,
          setId: 's1',
          hy: `բառ${n}`,
          ru: `с${n}`,
          createdAt: n,
        })),
        progress: [
          { wordId: 'u-1', box: 4, dueDate: '2026-11-30' },
          { wordId: 'u-2', box: 2, dueDate: '2026-12-31' },
          ...ids('transport', 1, 13).map((wordId) => ({ wordId, box: 4, dueDate: '2027-01-05' })),
          { wordId: 'transport-14', box: 3, dueDate: '2026-10-19' },
        ],
      })
      await check(page, 'home N>0')
      await page.locator('.set-row', { hasText: 'Набор' }).locator('.set-main').click()
      await expect(page.locator('.set-summary .pl')).toHaveText('выучено 1 · в изучении 1 из 3')
      await check(page, 'set')
      await page.goBack()
      await page.getByRole('link', { name: /Транспорт и такси/ }).click()
      await know(page)
      await expect(page.getByRole('heading', { name: 'Тема выучена!' })).toBeVisible()
      await check(page, 'S04b')
      await page.getByRole('button', { name: 'К темам' }).click()
      await expect(page.getByRole('button', { name: 'Повторить (0)' })).toBeDisabled()
      await expect(note(page)).toHaveText(/Следующее повторение — /)
      await check(page, 'home N=0')
    })
  })
}

test.describe('Перевод часов (157)', () => {
  test.use({ timezoneId: 'America/New_York' })
  test('в сутки перевода (01.11, 25 часов) «02.11» — завтра, «03.11» — послезавтра', async ({
    page,
  }) => {
    expect(await noteFor(page, new Date('2026-11-01T00:30:00-04:00'), '2026-11-02')).toBe(
      'Следующее повторение — завтра',
    )
  })
  test('«03.11» при сегодня 01.11 — послезавтра', async ({ page }) => {
    expect(await noteFor(page, new Date('2026-11-01T12:00:00-05:00'), '2026-11-03')).toBe(
      'Следующее повторение — послезавтра',
    )
  })
})
