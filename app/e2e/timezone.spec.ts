import { expect, test } from '@playwright/test'
import { dump, know, openWith } from './helpers.ts'

// Переход на зимнее время в США 2026-11-01 (в 02:00 часы идут назад): интервалы считаются
// календарными днями, а не по 24 часа (критерии 15–19, 22).
test.describe('Часовые пояса и перевод часов', () => {
  test.use({ timezoneId: 'America/New_York' })
  test('ответ вечером 31.10: dueDate = 02.11 (+2 дня через перевод часов)', async ({ page }) => {
    await openWith(page, {}, new Date(2026, 9, 31, 23, 30, 0))
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await know(page)
    await expect.poll(async () => (await dump(page, 'progress')).length).toBe(1)
    const [p] = await dump(page, 'progress')
    expect(p).toMatchObject({ box: 2, dueDate: '2026-11-02', lastReviewed: '2026-10-31' })
    const [d] = await dump(page, 'days')
    expect(d.date).toBe('2026-10-31')
  })

  test('серия через перевод часов: 30.10, 31.10, 01.11 → 3 дня', async ({ page }) => {
    await openWith(
      page,
      {
        days: ['2026-10-30', '2026-10-31', '2026-11-01'].map((date) => ({ date, answered: 1 })),
      },
      new Date(2026, 10, 1, 12, 0, 0),
    )
    await expect(page.locator('.growth')).toHaveAttribute('aria-label', /Серия: 3 дня/)
  })
})

test.describe('Ереван (UTC+4)', () => {
  test.use({ timezoneId: 'Asia/Yerevan' })
  test('00:30 по местному — уже новый день, хотя в UTC ещё вчера', async ({ page }) => {
    await openWith(page, {}, new Date(2026, 9, 20, 0, 30, 0))
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await know(page)
    await expect.poll(async () => (await dump(page, 'progress')).length).toBe(1)
    const [p] = await dump(page, 'progress')
    expect(p.lastReviewed).toBe('2026-10-20')
    expect(p.dueDate).toBe('2026-10-22')
  })
})
