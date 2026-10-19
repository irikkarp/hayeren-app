import { expect, test } from '@playwright/test'
import { addDays, dont, dump, ids, know, openWith, TODAY } from './helpers.ts'

const topicLink = (page: import('@playwright/test').Page, name: RegExp) =>
  page.getByRole('link', { name }).click()

test.describe('SRS (критерии 15–19, 20)', () => {
  test('новое слово, «Знаю»: box 2, dueDate = сегодня + 2', async ({ page }) => {
    await openWith(page)
    await topicLink(page, /Приветствия/)
    await know(page)
    await expect.poll(async () => (await dump(page, 'progress')).length).toBe(1)
    const [p] = await dump(page, 'progress')
    expect(p).toMatchObject({ wordId: 'greetings-01', box: 2, dueDate: addDays(TODAY, 2) })
  })

  test('новое слово, «Не знаю»: box 1, +1 день, повтор в конце один раз без изменения состояния', async ({
    page,
  }) => {
    await openWith(page)
    await topicLink(page, /Приветствия/)
    await dont(page)
    for (let i = 0; i < 9; i++) await know(page)
    await expect(page.getByText('Ещё раз', { exact: true })).toBeVisible()
    await expect(page.getByText('Осталось: 1')).toBeVisible()
    let p = (await dump(page, 'progress')).find((r) => r.wordId === 'greetings-01')
    expect(p).toMatchObject({ box: 1, dueDate: addDays(TODAY, 1), wrong: 1, correct: 0 })
    await know(page) // повторный показ: «Знаю» не меняет состояние
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
    p = (await dump(page, 'progress')).find((r) => r.wordId === 'greetings-01')
    expect(p).toMatchObject({ box: 1, dueDate: addDays(TODAY, 1), wrong: 1, correct: 0 })
    await expect(page.getByText('Пройдено').locator('xpath=preceding-sibling::b')).toHaveText('10')
  })

  test('повторный «Не знаю» на «Ещё раз» не создаёт третьего показа', async ({ page }) => {
    await openWith(page, {
      progress: [{ wordId: 'greetings-01', box: 3, dueDate: addDays(TODAY, -1) }],
      days: [{ date: TODAY, answered: 10, newStarted: 10 }],
    })
    await topicLink(page, /Приветствия/)
    await dont(page)
    await expect(page.getByText('Ещё раз', { exact: true })).toBeVisible()
    await dont(page)
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
    const p = (await dump(page, 'progress')).find((r) => r.wordId === 'greetings-01')
    expect(p).toMatchObject({ box: 1, wrong: 1 })
  })

  for (const [box, next, days] of [
    [1, 2, 2],
    [2, 3, 4],
    [3, 4, 8],
    [4, 5, 16],
    [5, 5, 16],
  ] as const) {
    test(`слово в коробке ${box}, «Знаю»: box ${next}, +${days} дн.`, async ({ page }) => {
      await openWith(page, {
        progress: [{ wordId: 'numbers-03', box, dueDate: addDays(TODAY, -3) }],
        days: [{ date: TODAY, answered: 10, newStarted: 10 }],
      })
      await topicLink(page, /Приветствия/)
      await expect(page.getByText('Повторение')).toBeVisible()
      await know(page)
      await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
      const p = (await dump(page, 'progress')).find((r) => r.wordId === 'numbers-03')
      expect(p).toMatchObject({ box: next, dueDate: addDays(TODAY, days) })
    })
  }

  test('«Не знаю» у слова из коробки 5 сбрасывает в 1', async ({ page }) => {
    await openWith(page, {
      progress: [{ wordId: 'shop-01', box: 5, dueDate: TODAY }],
      days: [{ date: TODAY, answered: 10, newStarted: 10 }],
    })
    await topicLink(page, /Магазин/)
    await dont(page)
    const p = (await dump(page, 'progress')).find((r) => r.wordId === 'shop-01')
    expect(p).toMatchObject({ box: 1, dueDate: addDays(TODAY, 1) })
  })

  test('просрочка не наказывается: слово 40 дней назад идёт первым и растёт на 1 коробку', async ({
    page,
  }) => {
    await openWith(page, {
      progress: [
        { wordId: 'food-01', box: 2, dueDate: addDays(TODAY, -40) },
        { wordId: 'food-02', box: 2, dueDate: addDays(TODAY, -1) },
      ],
    })
    await expect(page.getByRole('button', { name: 'Повторить (2)' })).toBeEnabled()
    await page.getByRole('button', { name: 'Повторить (2)' }).click()
    await expect(page.getByText('Осталось: 2')).toBeVisible()
    await expect(page.getByText('սուրճ', { exact: true })).toBeVisible() // food-01 — самый просроченный
  })

  test('дневной лимит 10 новых: общий по темам, «Учить ещё 10» поднимает на 10', async ({
    page,
  }) => {
    await openWith(page)
    await topicLink(page, /Приветствия/)
    for (let i = 0; i < 10; i++) await know(page)
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
    await page.getByRole('button', { name: 'К темам' }).click()
    // другая тема: лимит общий
    await topicLink(page, /Числа/)
    await expect(
      page.getByRole('heading', { name: 'На сегодня новых слов достаточно. Возвращайтесь завтра' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'К темам' })).toBeVisible()
    await page.getByRole('button', { name: 'Учить ещё 10 новых слов' }).click()
    await expect(page.getByText('Осталось: 10')).toBeVisible()
    await page.getByRole('button', { name: 'Завершить' }).click()
    // «Завершить» без ответов: итог 0, лимит всё ещё поднят
    await expect(page.getByRole('heading', { name: 'Сессия остановлена' })).toBeVisible()
  })

  test('в теме остаётся 5 новых после лимита: «Учить ещё 10» даёт 5 карточек', async ({ page }) => {
    await openWith(page, {
      progress: ids('greetings', 1, 10).map((wordId) => ({
        wordId,
        box: 2,
        dueDate: addDays(TODAY, 2),
      })),
      days: [{ date: TODAY, answered: 10, newStarted: 10 }],
    })
    await topicLink(page, /Приветствия/)
    await page.getByRole('button', { name: 'Учить ещё 10 новых слов' }).click()
    await expect(page.getByText('Осталось: 5')).toBeVisible()
  })

  test('лимит сбрасывается в полночь (вчерашние 10 новых не мешают)', async ({ page }) => {
    await openWith(page, {
      days: [{ date: addDays(TODAY, -1), answered: 10, newStarted: 10 }],
    })
    await topicLink(page, /Приветствия/)
    await expect(page.getByText('Осталось: 10')).toBeVisible()
  })

  test('«Завершить» и перезагрузка посреди сессии: ответы сохранены, сессия строится заново', async ({
    page,
  }) => {
    await openWith(page)
    await topicLink(page, /Приветствия/)
    await know(page)
    await know(page)
    await dont(page)
    await expect.poll(async () => (await dump(page, 'progress')).length).toBe(3)
    await page.reload()
    // 3 слова начаты → осталось 7 новых; «Не знаю» не возвращается (dueDate = завтра)
    await expect(page.getByText('Осталось: 7')).toBeVisible()
    expect(await dump(page, 'progress')).toHaveLength(3)
    await page.getByRole('button', { name: 'Завершить' }).click()
    await expect(page.getByRole('heading', { name: 'Сессия остановлена' })).toBeVisible()
    await page.getByRole('button', { name: 'К темам' }).click()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
  })

  test('очередь: сначала долги из всех тем, затем новые слова темы', async ({ page }) => {
    await openWith(page, {
      progress: [{ wordId: 'shop-01', box: 2, dueDate: addDays(TODAY, -1) }],
    })
    await topicLink(page, /Приветствия/)
    await expect(page.getByText('Осталось: 11')).toBeVisible()
    await expect(page.getByText('Повторение')).toBeVisible()
    await expect(page.getByText('խանութ', { exact: true })).toBeVisible()
  })

  test('более 30 долгов: в сессии ровно 30', async ({ page }) => {
    const due = [...ids('shop', 1, 15), ...ids('numbers', 1, 15), ...ids('food', 1, 14)].map(
      (wordId) => ({ wordId, box: 2, dueDate: addDays(TODAY, -1) }),
    )
    await openWith(page, { progress: due })
    await topicLink(page, /Приветствия/)
    // 44 долга → 30 повторений + 10 новых
    await expect(page.getByText('Осталось: 40')).toBeVisible()
  })
})
