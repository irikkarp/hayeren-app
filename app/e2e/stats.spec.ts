import { expect, test, type Page } from '@playwright/test'
import {
  addDays,
  dont,
  dump,
  ids,
  know,
  NOW,
  openWith,
  TODAY,
  type SeedProgress,
} from './helpers.ts'

const streakGroup = (page: Page) => page.locator('.growth')
const dueTile = (page: Page) =>
  page.locator('.stat', { hasText: 'Повторить сегодня' }).locator('.t-stat')

function days(...offsets: number[]) {
  return offsets.map((o) => ({ date: addDays(TODAY, o), answered: 3 }))
}

test.describe('Серия дней и гранаты (24–26, 139–148)', () => {
  const cases: [string, number[], RegExp, string, string][] = [
    ['0: нет ответов', [], /^Серии нет\. Ответьте на любую карточку/, 'Начните серию сегодня', ''],
    [
      '1: только вчера (не обнуляется)',
      [-1],
      /^Серия: 1 день подряд\. Гранат растёт, до спелого 4 дня$/,
      '1 день подряд',
      'Гранат растёт: до спелого 4 дня',
    ],
    ['0: последний ответ позавчера', [-2], /^Серии нет/, 'Начните серию сегодня', ''],
    [
      '1: сегодня и позавчера (пропущен вчерашний день)',
      [0, -2],
      /^Серия: 1 день подряд/,
      '1 день подряд',
      '',
    ],
    [
      '2: сегодня и вчера',
      [0, -1],
      /^Серия: 2 дня подряд\. Гранат растёт, до спелого 3 дня$/,
      '2 дня подряд',
      '',
    ],
    [
      '4: четыре дня до вчера',
      [-1, -2, -3, -4],
      /^Серия: 4 дня подряд\. Гранат растёт, до спелого 1 день$/,
      '4 дня подряд',
      'Гранат растёт: до спелого 1 день',
    ],
    [
      '5: созрел',
      [0, -1, -2, -3, -4],
      /^Серия: 5 дней подряд\. Гранат созрел$/,
      '5 дней подряд',
      'Гранат созрел',
    ],
    [
      '11 дней',
      Array.from({ length: 11 }, (_, i) => -i),
      /^Серия: 11 дней подряд\. Гранат созрел$/,
      '11 дней подряд',
      'Гранат созрел',
    ],
    [
      '21 день',
      Array.from({ length: 21 }, (_, i) => -i),
      /^Серия: 21 день подряд\. Гранат созрел$/,
      '21 день подряд',
      'Гранат созрел',
    ],
  ]
  for (const [name, offs, aria, title, sub] of cases) {
    test(`серия ${name}`, async ({ page }) => {
      await openWith(page, { days: days(...offs) })
      const g = streakGroup(page)
      await expect(g).toHaveAttribute('aria-label', aria)
      await expect(g.locator('b')).toHaveText(title)
      if (sub) await expect(g.locator('.sub')).toHaveText(sub)
    })
  }

  test('число закрашенных гранатов = min(d, 5) и пять мест при d = 3', async ({ page }) => {
    await openWith(page, { days: days(0, -1, -2) })
    const trees = page.locator('.growth .trees')
    await expect(trees.locator('> svg')).toHaveCount(4) // 3 закрашенных + 1 штриховой
    await expect(trees.locator('> *')).toHaveCount(5)
  })

  test('первый ответ дня увеличивает серию: 2 → 3; повторные ответы не меняют', async ({
    page,
  }) => {
    await openWith(page, { days: days(-1, -2) })
    await expect(streakGroup(page)).toHaveAttribute('aria-label', /Серия: 2 дня/)
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await know(page)
    await know(page)
    await page.getByRole('button', { name: 'Завершить' }).click()
    await expect(page.getByText('Серия растёт: 3 дня подряд')).toBeVisible()
    await page.getByRole('button', { name: 'К темам' }).click()
    await expect(streakGroup(page)).toHaveAttribute('aria-label', /Серия: 3 дня/)
  })

  test('переход через полночь: серия сохраняется, N пересчитывается без перезагрузки', async ({
    page,
  }) => {
    const late = new Date(2026, 9, 19, 23, 59, 40)
    await openWith(
      page,
      {
        days: days(0, -1),
        progress: [{ wordId: 'shop-01', box: 2, dueDate: addDays(TODAY, 1) }],
      },
      late,
    )
    await expect(dueTile(page)).toHaveText('0')
    await expect(page.getByRole('button', { name: 'Повторить (0)' })).toBeDisabled()
    await page.clock.fastForward(30_000) // 00:00:10 следующего дня, срабатывает таймер полуночи
    await expect(dueTile(page)).toHaveText('1')
    await expect(page.getByRole('button', { name: 'Повторить (1)' })).toBeEnabled()
    // вчера (19-е) было активно → серия 2 сохраняется, сегодня (20-е) ещё нет
    await expect(streakGroup(page)).toHaveAttribute('aria-label', /Серия: 2 дня/)
  })

  test('после полуночи без ответов вчерашняя серия 1 переходит в 0 через день', async ({
    page,
  }) => {
    await openWith(page, { days: days(0) }, new Date(2026, 9, 19, 23, 59, 40))
    await expect(streakGroup(page)).toHaveAttribute('aria-label', /Серия: 1 день/)
    await page.clock.fastForward(30_000)
    await expect(streakGroup(page)).toHaveAttribute('aria-label', /Серия: 1 день/)
    await page.clock.setSystemTime(new Date(2026, 9, 21, 0, 0, 5))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(streakGroup(page)).toHaveAttribute('aria-label', /^Серии нет/)
  })
})

test.describe('Повторить (N) (110–123)', () => {
  const due45: SeedProgress[] = [
    ...ids('shop', 1, 15),
    ...ids('numbers', 1, 15),
    ...ids('food', 1, 14),
    ...ids('housing', 1, 1),
  ].map((wordId, i) => ({ wordId, box: 2, dueDate: addDays(TODAY, -(i % 3)) }))

  test('N = 0 без прогресса: кнопка disabled, пояснение, плитка 0', async ({ page }) => {
    await openWith(page)
    const btn = page.getByRole('button', { name: 'Повторить (0)' })
    await expect(btn).toBeDisabled()
    await expect(page.getByText('Пока нечего повторять: начните с любой темы')).toBeVisible()
    await expect(btn).toHaveAttribute('aria-describedby', 'review-note')
    await expect(dueTile(page)).toHaveText('0')
    await btn.click({ force: true })
    await expect(page).toHaveURL(/#\/$/)
  })

  test('N = 0 при наличии прогресса: «На сегодня всё повторено»', async ({ page }) => {
    await openWith(page, { progress: [{ wordId: 'shop-01', box: 2, dueDate: addDays(TODAY, 2) }] })
    await expect(page.getByText('На сегодня всё повторено')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Повторить (0)' })).toBeDisabled()
  })

  test('N = слово с dueDate = сегодня входит, завтра не входит, новые не входят', async ({
    page,
  }) => {
    await openWith(page, {
      progress: [
        { wordId: 'shop-01', box: 2, dueDate: TODAY },
        { wordId: 'shop-02', box: 2, dueDate: addDays(TODAY, 1) },
        { wordId: 'shop-03', box: 2, dueDate: addDays(TODAY, -5) },
      ],
    })
    await expect(dueTile(page)).toHaveText('2')
    await expect(page.getByRole('button', { name: 'Повторить (2)' })).toBeEnabled()
    await expect(page.locator('.repeat-note')).toHaveCount(0)
  })

  test('N = 45: кнопка и плитка 45, подпись про 30; сессия 30; после 30 «Знаю» осталось 15', async ({
    page,
  }) => {
    await openWith(page, { progress: due45 })
    await expect(dueTile(page)).toHaveText('45')
    await expect(page.getByRole('button', { name: 'Повторить (45)' })).toBeEnabled()
    await expect(page.getByText('В сессии 30 слов, остальные — в следующей')).toBeVisible()
    await page.getByRole('button', { name: 'Повторить (45)' }).click()
    await expect(page.getByText('Осталось: 30')).toBeVisible()
    await expect(page.getByRole('button', { name: /Учить ещё 10/ })).toHaveCount(0)
    for (let i = 0; i < 30; i++) await know(page)
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
    await expect(page.getByText('Осталось повторить: 15')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Повторить ещё (15)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'На главную' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Учить ещё 10/ })).toHaveCount(0)
    // новые слова не расходуют лимит
    const d = await dump(page, 'days')
    expect(d[0].newStarted).toBe(0)
    await page.getByRole('button', { name: 'Повторить ещё (15)' }).click()
    await expect(page.getByText('Осталось: 15')).toBeVisible()
    await page.getByRole('button', { name: 'Завершить' }).click()
    await page.getByRole('button', { name: 'На главную' }).click()
    await expect(dueTile(page)).toHaveText('15')
    await expect(page.getByRole('button', { name: 'Повторить (15)' })).toBeEnabled()
  })

  test('«Не знаю» в общей сессии: слово не входит в K, возвращается один раз', async ({ page }) => {
    await openWith(page, {
      progress: [
        { wordId: 'shop-01', box: 2, dueDate: addDays(TODAY, -2) },
        { wordId: 'shop-02', box: 2, dueDate: addDays(TODAY, -1) },
      ],
    })
    await page.getByRole('button', { name: 'Повторить (2)' }).click()
    await dont(page)
    await know(page)
    await expect(page.getByText('Ещё раз', { exact: true })).toBeVisible()
    await dont(page)
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
    await expect(page.getByText('Осталось повторить')).toHaveCount(0)
    const p = (await dump(page, 'progress')).find((r) => r.wordId === 'shop-01')
    expect(p).toMatchObject({ box: 1, dueDate: addDays(TODAY, 1), wrong: 1 })
  })

  test('порядок: просроченность, затем коробка, затем id', async ({ page }) => {
    await openWith(page, {
      progress: [
        { wordId: 'numbers-01', box: 3, dueDate: addDays(TODAY, -1) },
        { wordId: 'shop-01', box: 2, dueDate: addDays(TODAY, -1) },
        { wordId: 'shop-02', box: 2, dueDate: addDays(TODAY, -1) },
        { wordId: 'food-01', box: 5, dueDate: addDays(TODAY, -5) },
      ],
    })
    await page.getByRole('button', { name: 'Повторить (4)' }).click()
    const order = ['սուրճ', 'խանութ', 'շուկա', 'մեկ']
    for (const hy of order) {
      await expect(page.locator('.hy-hero')).toHaveText(hy)
      await know(page)
    }
  })

  test('устаревший экран (критерий 120): очередь пуста — остаёмся на главной', async ({ page }) => {
    await openWith(page, { progress: [{ wordId: 'shop-01', box: 2, dueDate: TODAY }] })
    // сдвигаем время в другой день, где долг есть, но дату обновили: имитируем прямым переходом
    await page.goto('/#/session/review')
    await expect(page.getByText('Осталось: 1')).toBeVisible()
    await know(page)
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
    await page.goto('/#/session/review')
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
  })

  test('N на плитке обновляется после сессии и сброса', async ({ page }) => {
    await openWith(page, { progress: [{ wordId: 'shop-01', box: 2, dueDate: TODAY }] })
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    await page.getByRole('button', { name: 'На главную' }).click()
    await expect(dueTile(page)).toHaveText('0')
    await expect(page.getByRole('button', { name: 'Повторить (0)' })).toBeDisabled()
  })

  test('склонение «слово/слова/слов» на плитке', async ({ page }) => {
    await openWith(page, {
      progress: ids('shop', 1, 2).map((wordId) => ({ wordId, box: 2, dueDate: TODAY })),
    })
    await expect(
      page.locator('.stat', { hasText: 'Повторить сегодня' }).locator('.sub'),
    ).toHaveText('слова')
    expect(NOW).toBeTruthy()
  })
})
