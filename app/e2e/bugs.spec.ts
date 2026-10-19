// Регрессия по найденным багам (docs/qa/001-stage1-report.md); баги исправлены.
import { expect, test } from '@playwright/test'
import { addDays, know, learnedTopic, openWith, TODAY } from './helpers.ts'

const celebrateSeed = {
  progress: [
    ...learnedTopic('greetings', ['greetings-15']),
    { wordId: 'greetings-15', box: 3, dueDate: addDays(TODAY, -1) },
  ],
}

test.describe('BUG-2: S04b повторно после Назад → Вперёд (кр. 127, 137)', () => {
  test('Вперёд на /session/result не показывает S04b второй раз', async ({ page }) => {
    await openWith(page, celebrateSeed)
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    await expect(page.getByRole('heading', { name: 'Тема выучена!' })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    await page.goForward()
    await expect(page.getByRole('heading', { name: 'Тема выучена!' })).toHaveCount(0)
  })
})

test.describe('BUG-1: тост перекрывает главную кнопку S04b', () => {
  test.use({ viewport: { width: 360, height: 760 } })
  test('тост не пересекается с кнопками на S04b', async ({ page }) => {
    await openWith(page, celebrateSeed)
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    await expect(page.getByRole('heading', { name: 'Тема выучена!' })).toBeVisible()
    // тост сессии не переживает выход с экрана и не перекрывает кнопки; нажатие сразу работает
    await expect(page.locator('.toast')).toHaveCount(0)
    await page.getByRole('button', { name: /Следующая тема/ }).click({ timeout: 1000 })
    await expect(page.getByText('Новое слово')).toBeVisible()
  })
})

test.describe('BUG-5: тост не остаётся на главной после сессии', () => {
  test('после «К темам» тоста нет', async ({ page }) => {
    await openWith(page)
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await know(page)
    await expect(page.locator('.toast')).toBeVisible()
    await page.getByRole('button', { name: 'Завершить' }).click()
    await page.getByRole('button', { name: 'К темам' }).click()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    await expect(page.locator('.toast')).toHaveCount(0)
  })
})

test.describe('BUG-3: S04 без ответов показывает строку серии (дизайн S04, «Состояния»)', () => {
  test('«Завершить» до первого ответа: строки серии нет', async ({ page }) => {
    await openWith(page, {
      progress: [{ wordId: 'shop-01', box: 2, dueDate: TODAY }],
      days: [-1, -2, -3].map((o) => ({ date: addDays(TODAY, o), answered: 2 })),
    })
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await page.getByRole('button', { name: 'Завершить' }).click()
    await expect(page.getByRole('heading', { name: 'Сессия остановлена' })).toBeVisible()
    await expect(page.getByText(/^Серия/)).toHaveCount(0)
  })
})

test.describe('BUG-1b: тост перекрывает «Повторить ещё (K)» на S04 (все размеры)', () => {
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
  ]) {
    test.describe(`${width}x${height}`, () => {
      test.use({ viewport: { width, height } })
      test('тост не пересекается с кнопками на S04', async ({ page }) => {
        await openWith(page, {
          progress: ['shop-01', 'shop-02'].map((wordId) => ({
            wordId,
            box: 2,
            dueDate: addDays(TODAY, -1),
          })),
        })
        await page.getByRole('button', { name: 'Повторить (2)' }).click()
        await know(page)
        await page.getByRole('button', { name: 'Завершить' }).click()
        await expect(page.getByRole('button', { name: 'Повторить ещё (1)' })).toBeVisible()
        await expect(page.locator('.toast')).toHaveCount(0)
        // нажатие по центру кнопки сразу после итога должно попасть в кнопку
        await page.getByRole('button', { name: 'Повторить ещё (1)' }).click({ timeout: 1000 })
        await expect(page.getByText('Осталось: 1')).toBeVisible()
      })
    })
  }
})
