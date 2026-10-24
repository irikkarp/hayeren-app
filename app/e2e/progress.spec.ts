import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  addDays,
  ALL_IDS,
  dont,
  ids,
  know,
  openWith,
  TODAY,
  type Seed,
  type SeedProgress,
} from './helpers.ts'

// «Видимый прогресс» (001 ред. 11, критерии 149–167). Сегодня в e2e — 2026-10-19.

const topicRow = (page: Page, name: string) => page.locator('.list .row', { hasText: name }).first()
const bar = (page: Page, name: string) => topicRow(page, name).getByRole('progressbar')
const line = (page: Page, name: string) => topicRow(page, name).locator('.pl')
const learnedTile = (page: Page) => page.locator('.stat', { hasText: 'Выучено' })
const dueTile = (page: Page) => page.locator('.stat', { hasText: 'Повторить сегодня' })

async function noHScroll(page: Page) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }))
  expect(m.sw).toBeLessThanOrEqual(m.iw)
}

async function axe(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(
    res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    `axe on ${label}`,
  ).toEqual([])
}

/** Ширина сегмента бара в долях ширины самого бара. */
async function segShare(page: Page, name: string, cls: 'seg-l' | 'seg-i') {
  const b = await bar(page, name).boundingBox()
  const s = await bar(page, name).locator(`.${cls}`).boundingBox()
  if (!b || !s) throw new Error('bar not found')
  return s.width / b.width
}

test.describe('Сценарий из bug-counter-report: первая сессия из 10 «Знаю»', () => {
  test('главная, итог сессии и перезагрузка (149–159, 167)', async ({ page }) => {
    await openWith(page)
    await page.getByRole('link', { name: /Приветствия и вежливость/ }).click()
    for (let i = 0; i < 10; i++) await know(page)

    // Итог: пояснительный блок (154–156)
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
    const explain = page.locator('.explain')
    await expect(explain).toContainText('Новых слов в изучении: 10.')
    await expect(explain).toContainText(
      'Слово становится выученным после двух повторений: через 2 дня и ещё через 4.',
    )
    await expect(explain).toContainText('Следующее повторение — послезавтра.')
    await expect(explain).toContainText('В теме «Приветствия и вежливость» осталось 5 новых слов.')
    await page.getByRole('button', { name: 'К темам' }).click()

    for (const reload of [false, true]) {
      if (reload) {
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
      }
      await expect(line(page, 'Приветствия и вежливость')).toHaveText(
        'выучено 0 · в изучении 10 из 15',
      )
      const b = bar(page, 'Приветствия и вежливость')
      await expect(b).toHaveAttribute('aria-valuemin', '0')
      await expect(b).toHaveAttribute('aria-valuemax', '15')
      await expect(b).toHaveAttribute('aria-valuenow', '0')
      await expect(b).toHaveAttribute('aria-valuetext', 'выучено 0, в изучении 10 из 15')
      await expect(b.locator('.seg-l')).toHaveCount(0)
      await expect(b.locator('.seg-i')).toHaveCount(1)
      expect(await segShare(page, 'Приветствия и вежливость', 'seg-i')).toBeCloseTo(10 / 15, 1)
      await expect(line(page, 'Числа и цены')).toHaveText('выучено 0 из 15')

      await expect(learnedTile(page)).toContainText('0 из 88')
      await expect(learnedTile(page)).toContainText('в изучении 10')
      await expect(dueTile(page)).toContainText('0')
      await expect(page.getByRole('button', { name: 'Повторить (0)' })).toBeDisabled()
      await expect(page.locator('#review-note')).toHaveText('Следующее повторение — послезавтра')
      await expect(page.getByRole('button', { name: 'Повторить (0)' })).toHaveAccessibleDescription(
        'Следующее повторение — послезавтра',
      )
      await expect(page.getByText('На сегодня всё повторено')).toHaveCount(0)
    }
  })

  test('без состояний: «выучено 0 из N», «в изучении 0», подсказка (159, 163а)', async ({
    page,
  }) => {
    await openWith(page)
    await expect(line(page, 'Жильё')).toHaveText('выучено 0 из 15')
    await expect(bar(page, 'Жильё')).toHaveAttribute('aria-valuetext', 'выучено 0 из 15')
    await expect(bar(page, 'Жильё').locator('span')).toHaveCount(0)
    await expect(learnedTile(page)).toContainText('0 из 88')
    await expect(learnedTile(page)).toContainText('в изучении 0')
    await expect(page.locator('#review-note')).toHaveText(
      'Пока нечего повторять: начните с любой темы',
    )
  })

  test('все «Не знаю»: слова в изучении сразу, схема не обещается (154, 149)', async ({ page }) => {
    await openWith(page)
    await page.getByRole('link', { name: /Приветствия и вежливость/ }).click()
    for (let i = 0; i < 10; i++) await dont(page) // первый показ
    for (let i = 0; i < 10; i++) await dont(page) // повторный показ
    const explain = page.locator('.explain')
    await expect(explain).toContainText('Новых слов в изучении: 10.')
    await expect(explain).toContainText(
      'Выученными слова станут после нескольких успешных повторений.',
    )
    await expect(explain).not.toContainText('через 2 дня')
    await expect(explain).toContainText('Следующее повторение — завтра.')
    await page.getByRole('button', { name: 'К темам' }).click()
    await expect(line(page, 'Приветствия и вежливость')).toHaveText(
      'выучено 0 · в изучении 10 из 15',
    )
    await expect(page.locator('#review-note')).toHaveText('Следующее повторение — завтра')
  })

  test('общая сессия «Повторить (N)»: только дата, без блока про новые слова (160)', async ({
    page,
  }) => {
    await openWith(page, { progress: [{ wordId: 'shop-01', box: 2, dueDate: TODAY }] })
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    const explain = page.locator('.explain')
    await expect(explain).toHaveText('Следующее повторение — 23 октября.')
    await expect(page.getByText('Новых слов в изучении')).toHaveCount(0)
    await expect(page.getByText('Осталось повторить')).toHaveCount(0)
  })

  test('общая сессия, N > 0 после неё: «Осталось повторить», даты нет (160)', async ({ page }) => {
    const progress = ids('shop', 1, 3).map((wordId) => ({ wordId, box: 2, dueDate: TODAY }))
    await openWith(page, { progress })
    await page.getByRole('button', { name: 'Повторить (3)' }).click()
    await page.getByRole('button', { name: 'Завершить' }).click()
    await expect(page.getByText('Осталось повторить: 3')).toBeVisible()
    await expect(page.locator('.explain')).toHaveCount(0)
  })
})

test.describe('Всё выучено', () => {
  const progress: SeedProgress[] = ALL_IDS.map((wordId) => ({
    wordId,
    box: 5,
    dueDate: addDays(TODAY, 8),
  }))

  test('строки «N из N», полные бары, «в изучении 0», дата (163б)', async ({ page }) => {
    await openWith(page, { progress })
    await expect(line(page, 'Приветствия и вежливость')).toHaveText('выучено 15 из 15')
    await expect(line(page, 'Транспорт и такси')).toHaveText('выучено 14 из 14')
    const b = bar(page, 'Приветствия и вежливость')
    await expect(b).toHaveAttribute('aria-valuetext', 'выучено 15 из 15')
    await expect(b.locator('.seg-i')).toHaveCount(0)
    expect(await segShare(page, 'Приветствия и вежливость', 'seg-l')).toBeGreaterThan(0.98)
    await expect(topicRow(page, 'Жильё')).toContainText('✓ Выучена')
    await expect(learnedTile(page)).toContainText('88 из 88')
    await expect(learnedTile(page)).toContainText('в изучении 0')
    await expect(page.locator('#review-note')).toHaveText('Следующее повторение — 27 октября')
  })

  test('дата в другом году — с годом (158)', async ({ page }) => {
    await openWith(page, {
      progress: [{ wordId: 'food-01', box: 5, dueDate: '2027-01-05' }],
    })
    await expect(page.locator('#review-note')).toHaveText('Следующее повторение — 5 января 2027')
  })
})

test.describe('Смешанное состояние', () => {
  const progress: SeedProgress[] = [
    ...ids('greetings', 1, 3).map((wordId) => ({ wordId, box: 4, dueDate: addDays(TODAY, 8) })),
    ...ids('greetings', 4, 8).map((wordId) => ({ wordId, box: 2, dueDate: addDays(TODAY, 2) })),
    { wordId: 'food-01', box: 1, dueDate: addDays(TODAY, 1) },
    // выучено → откат в коробку 1: считается «в изучении»
    { wordId: 'food-02', box: 1, dueDate: addDays(TODAY, 1) },
  ]

  test('строки, сегменты, плитка, дата ближайшего повторения (150–153, 157)', async ({ page }) => {
    await openWith(page, { progress })
    await expect(line(page, 'Приветствия и вежливость')).toHaveText(
      'выучено 3 · в изучении 5 из 15',
    )
    const b = bar(page, 'Приветствия и вежливость')
    await expect(b).toHaveAttribute('aria-valuenow', '3')
    await expect(b).toHaveAttribute('aria-valuetext', 'выучено 3, в изучении 5 из 15')
    expect(await segShare(page, 'Приветствия и вежливость', 'seg-l')).toBeCloseTo(3 / 15, 1)
    expect(await segShare(page, 'Приветствия и вежливость', 'seg-i')).toBeCloseTo(5 / 15, 1)
    // Сегменты различимы не только цветом: сплошной и штриховой с контуром.
    const styles = await b.evaluate((el) => ({
      l: getComputedStyle(el.querySelector('.seg-l')!).backgroundImage,
      i: getComputedStyle(el.querySelector('.seg-i')!).backgroundImage,
      shadow: getComputedStyle(el.querySelector('.seg-i')!).boxShadow,
    }))
    expect(styles.l).toBe('none')
    expect(styles.i).toContain('repeating-linear-gradient')
    expect(styles.shadow).not.toBe('none')

    await expect(line(page, 'Кафе и еда')).toHaveText('выучено 0 · в изучении 2 из 14')
    await expect(learnedTile(page)).toContainText('3 из 88')
    await expect(learnedTile(page)).toContainText('в изучении 7')
    // Ближайшая дата — завтра (слова food-*), а не послезавтра у greetings.
    await expect(page.locator('#review-note')).toHaveText('Следующее повторение — завтра')
    await expect(dueTile(page).locator('.nextrev')).toHaveText('Следующее повторение — завтра')
  })

  test('тема, выученная целиком в сессии: S04b без пояснительного блока (165б)', async ({
    page,
  }) => {
    const nearly: SeedProgress[] = [
      ...ids('transport', 1, 13).map((wordId) => ({ wordId, box: 4, dueDate: addDays(TODAY, 8) })),
      { wordId: 'transport-14', box: 3, dueDate: TODAY },
    ]
    await openWith(page, { progress: nearly })
    await page.getByRole('link', { name: /Транспорт и такси/ }).click()
    await know(page)
    await expect(page.getByRole('heading', { name: 'Тема выучена!' })).toBeVisible()
    await expect(page.locator('.explain')).toHaveCount(0)
  })

  test('набор: строка, бар и сводка на экране набора (38, 80, 164)', async ({ page }) => {
    const seed: Seed = {
      userSets: [{ id: 's1', title: 'Урок 5', createdAt: 1 }],
      userWords: ['u-1', 'u-2', 'u-3', 'u-4'].map((id, i) => ({
        id,
        setId: 's1',
        hy: `բառ${i}`,
        ru: `слово ${i}`,
        createdAt: 1 + i,
      })),
      progress: [
        { wordId: 'u-1', box: 4, dueDate: addDays(TODAY, 8) },
        { wordId: 'u-2', box: 2, dueDate: addDays(TODAY, 2) },
      ],
    }
    await openWith(page, seed)
    const row = page.locator('.set-row', { hasText: 'Урок 5' })
    await expect(row.locator('.pl')).toHaveText('выучено 1 · в изучении 1 из 4')
    await expect(row.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      'выучено 1, в изучении 1 из 4',
    )
    await expect(learnedTile(page)).toContainText('1 из 92')
    await expect(learnedTile(page)).toContainText('в изучении 1')
    await row.locator('.set-main').click()
    await expect(page.locator('.set-summary .pl')).toHaveText('выучено 1 · в изучении 1 из 4')
    await page.getByRole('link', { name: 'Учить', exact: true }).click()
    await know(page)
    await know(page)
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
    await expect(page.locator('.explain')).toContainText('Новых слов в изучении: 2.')
    await expect(page.locator('.explain')).not.toContainText('осталось')
    await expect(page.locator('.explain')).toContainText('Следующее повторение — послезавтра.')
  })
})

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [320, 360]) {
    test.describe(`вид ${scheme} ${width}px`, () => {
      test.use({ colorScheme: scheme, viewport: { width, height: 640 } })

      test('главная с двухцветными барами и итог сессии: без горизонтального скролла и нарушений axe', async ({
        page,
      }) => {
        const seed: Seed = {
          progress: [
            ...ids('greetings', 1, 3).map((wordId) => ({
              wordId,
              box: 4,
              dueDate: addDays(TODAY, 8),
            })),
            ...ids('greetings', 4, 8).map((wordId) => ({
              wordId,
              box: 2,
              dueDate: addDays(TODAY, 2),
            })),
          ],
          userSets: [
            {
              id: 's1',
              title: 'Урок 5. Очень длинное название набора для проверки переноса',
              createdAt: 1,
            },
          ],
          userWords: [1, 2].map((n) => ({
            id: `u-${n}`,
            setId: 's1',
            hy: `բառ${n}`,
            ru: `слово ${n}`,
            createdAt: n,
          })),
        }
        await openWith(page, seed)
        await expect(line(page, 'Приветствия и вежливость')).toBeVisible()
        await noHScroll(page)
        await axe(page, `home ${scheme} ${width}`)

        await page.getByRole('link', { name: /Числа и цены/ }).click()
        for (let i = 0; i < 10; i++) await know(page)
        await expect(page.locator('.explain')).toBeVisible()
        await noHScroll(page)
        await axe(page, `result ${scheme} ${width}`)
      })
    })
  }
}
