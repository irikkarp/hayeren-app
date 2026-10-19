import { expect, test } from '@playwright/test'

test('онбординг → главная → сессия по теме → ответы → итог', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Hayeren')

  // Онбординг
  await expect(page.getByRole('heading', { name: 'Как вы хотите заниматься?' })).toBeVisible()
  await page.getByRole('button', { name: /Учу армянский с нуля/ }).click()

  // Главная
  await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Повторить (0)' })).toBeDisabled()
  await expect(page.getByText('выучено 0 из 15').first()).toBeVisible()

  // Сессия по теме: 10 новых слов, одно «Не знаю» (вернётся в конце)
  await page.getByRole('link', { name: /Приветствия и вежливость/ }).click()
  await expect(page.getByText('Осталось: 10')).toBeVisible()
  await expect(page.getByRole('button', { name: /Знаю/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Показать ответ' }).click()
  await expect(page.getByText('привет', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Не знаю/ }).click()
  for (let i = 0; i < 9; i++) {
    await page.getByRole('button', { name: 'Показать ответ' }).click()
    await page.getByRole('button', { name: /^✓? ?Знаю$/ }).click()
  }
  await expect(page.getByText('Ещё раз')).toBeVisible()
  await page.getByRole('button', { name: 'Показать ответ' }).click()
  await page.getByRole('button', { name: /^✓? ?Знаю$/ }).click()

  // Итог
  await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
  await expect(page.getByText('Серия растёт: 1 день подряд')).toBeVisible()
  await page.getByRole('button', { name: 'К темам' }).click()
  await expect(page.getByText('выучено 0 из 15').first()).toBeVisible()
  await expect(page.getByRole('group', { name: /Серия: 1 день подряд/ })).toBeVisible()

  // Прогресс сохранён после перезагрузки (IndexedDB)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
  await expect(page.getByRole('group', { name: /Серия: 1 день подряд/ })).toBeVisible()
})
