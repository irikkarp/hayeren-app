import { expect, test } from '@playwright/test'
import {
  addDays,
  ALL_IDS,
  dont,
  dump,
  know,
  learnedTopic,
  openWith,
  TODAY,
  type SeedProgress,
} from './helpers.ts'

const lastWordDue = (id: string): SeedProgress => ({
  wordId: id,
  box: 3,
  dueDate: addDays(TODAY, -1),
})

test.describe('Тема выучена S04b (124–138)', () => {
  test('последнее слово 3→4: S04b, фокус на заголовке, следующая тема, отметка сохранена', async ({
    page,
  }) => {
    await openWith(page, {
      progress: [...learnedTopic('greetings', ['greetings-15']), lastWordDue('greetings-15')],
    })
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    const h = page.getByRole('heading', { name: 'Тема выучена!' })
    await expect(h).toBeVisible()
    await expect(h).toBeFocused()
    await expect(page.getByText('Приветствия и вежливость: выучено 15 из 15')).toBeVisible()
    await expect(page.locator('[lang="hy"]', { hasText: 'Շատ լավ' })).toBeVisible()
    await expect(page.getByText('shat lav · очень хорошо')).toBeVisible()
    await expect(page.getByText('Всего выучено: 15 из 88 · Серия: 1 день подряд')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Следующая тема: Числа и цены' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'К темам' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Повторить ещё/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Учить ещё 10/ })).toHaveCount(0)
    const c = await dump(page, 'celebrations')
    expect(c).toMatchObject([{ topicId: 'greetings', status: 'celebrated' }])
  })

  test('«Следующая тема» открывает сессию по ней', async ({ page }) => {
    await openWith(page, {
      progress: [...learnedTopic('greetings', ['greetings-15']), lastWordDue('greetings-15')],
    })
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    await page.getByRole('button', { name: 'Следующая тема: Числа и цены' }).click()
    await expect(page.getByText('Новое слово')).toBeVisible()
    await expect(page.locator('.hy-hero')).toHaveText('մեկ')
  })

  test('не последнее слово и «Не знаю» не вызывают S04b', async ({ page }) => {
    await openWith(page, {
      progress: [
        ...learnedTopic('greetings', ['greetings-14', 'greetings-15']),
        lastWordDue('greetings-14'),
        lastWordDue('greetings-15'),
      ],
    })
    await page.getByRole('button', { name: 'Повторить (2)' }).click()
    await know(page)
    await dont(page)
    await know(page) // "Ещё раз" для не знаю
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
    expect(await dump(page, 'celebrations')).toHaveLength(0)
  })

  test('показывается один раз: после отпразднованной темы S04 обычный', async ({ page }) => {
    await openWith(page, {
      progress: [...learnedTopic('greetings', ['greetings-15']), lastWordDue('greetings-15')],
      celebrations: [{ topicId: 'greetings', status: 'celebrated' }],
    })
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
  })

  test('две темы в одной сессии: один экран «Темы выучены!», строки по order, следующая — shop', async ({
    page,
  }) => {
    await openWith(page, {
      progress: [
        ...learnedTopic('numbers', ['numbers-15']),
        lastWordDue('numbers-15'),
        ...learnedTopic('greetings', ['greetings-15']),
        lastWordDue('greetings-15'),
      ],
    })
    await page.getByRole('button', { name: 'Повторить (2)' }).click()
    await know(page)
    await know(page)
    await expect(page.getByRole('heading', { name: 'Темы выучены!' })).toBeVisible()
    const lines = page.locator('.win .muted')
    await expect(lines.nth(0)).toHaveText('Приветствия и вежливость: выучено 15 из 15')
    await expect(lines.nth(1)).toHaveText('Числа и цены: выучено 15 из 15')
    await expect(
      page.getByRole('button', { name: 'Следующая тема: Магазин и рынок' }),
    ).toBeVisible()
    expect(await dump(page, 'celebrations')).toHaveLength(2)
  })

  test('все 6 тем выучены: нет «Следующей темы», «К темам» primary', async ({ page }) => {
    const rest = ALL_IDS.filter((id) => id !== 'food-14').map((wordId) => ({
      wordId,
      box: 4,
      dueDate: addDays(TODAY, 8),
    }))
    await openWith(page, {
      progress: [...rest, lastWordDue('food-14')],
      celebrations: ['greetings', 'numbers', 'shop', 'transport', 'housing'].map((topicId) => ({
        topicId,
        status: 'celebrated' as const,
      })),
    })
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    await expect(page.getByRole('heading', { name: 'Тема выучена!' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Следующая тема/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'К темам' })).toHaveClass(/btn-primary/)
    await expect(page.getByText('Всего выучено: 88 из 88')).toBeVisible()
  })

  test('переход зафиксирован в сессии по другой теме; показ — в конце той сессии', async ({
    page,
  }) => {
    await openWith(page, {
      progress: [...learnedTopic('greetings', ['greetings-15']), lastWordDue('greetings-15')],
    })
    await page.getByRole('link', { name: /Числа/ }).click()
    await expect(page.getByText('Повторение')).toBeVisible() // долг из greetings идёт первым
    await know(page)
    await page.getByRole('button', { name: 'Завершить' }).click()
    await expect(page.getByRole('heading', { name: 'Тема выучена!' })).toBeVisible()
    await expect(page.getByText('Приветствия и вежливость: выучено 15 из 15')).toBeVisible()
  })

  test('закрытая вкладка до показа: ожидание сохраняется и показывается в следующей сессии', async ({
    page,
  }) => {
    await openWith(page, {
      progress: [...learnedTopic('greetings', ['greetings-15']), lastWordDue('greetings-15')],
    })
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await page.getByRole('button', { name: 'Показать ответ' }).click()
    await page.getByRole('button', { name: 'Знаю', exact: true }).click()
    await expect.poll(async () => (await dump(page, 'celebrations')).length).toBe(1)
    expect((await dump(page, 'celebrations'))[0].status).toBe('celebrated')
  })

  test('ожидающая тема отложена (pending из хранилища) и показана в конце любой сессии', async ({
    page,
  }) => {
    await openWith(page, {
      progress: learnedTopic('greetings'),
      celebrations: [{ topicId: 'greetings', status: 'pending' }],
    })
    await page.getByRole('link', { name: /Числа/ }).click()
    await know(page)
    await page.getByRole('button', { name: 'Завершить' }).click()
    await expect(page.getByRole('heading', { name: 'Тема выучена!' })).toBeVisible()
  })

  test('ожидающая, но уже не выученная тема: обычный итог, отметка снята', async ({ page }) => {
    await openWith(page, {
      progress: [
        ...learnedTopic('greetings', ['greetings-15']),
        { wordId: 'greetings-15', box: 1, dueDate: addDays(TODAY, 1) },
      ],
      celebrations: [{ topicId: 'greetings', status: 'pending' }],
    })
    await page.getByRole('link', { name: /Числа/ }).click()
    await know(page)
    await page.getByRole('button', { name: 'Завершить' }).click()
    await expect(page.getByRole('heading', { name: 'Сессия остановлена' })).toBeVisible()
    expect(await dump(page, 'celebrations')).toHaveLength(0)
  })

  test('Назад и обновление на S04b ведут на главную, повторно не показывается', async ({
    page,
  }) => {
    await openWith(page, {
      progress: [...learnedTopic('greetings', ['greetings-15']), lastWordDue('greetings-15')],
    })
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    await expect(page.getByRole('heading', { name: 'Тема выучена!' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
  })

  test('S04b: нет автофокуса-ловушек и aria-hidden у декора', async ({ page }) => {
    await openWith(page, {
      progress: [...learnedTopic('greetings', ['greetings-15']), lastWordDue('greetings-15')],
    })
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    await expect(page.locator('.grown')).toHaveAttribute('aria-hidden', 'true')
  })
})

test.describe('Сброс прогресса (35, 86, 135)', () => {
  test('отмена ничего не меняет; подтверждение стирает прогресс, серию и отметки, режим остаётся', async ({
    page,
  }) => {
    await openWith(page, {
      mode: 'reader',
      progress: [...learnedTopic('greetings')],
      days: [{ date: TODAY, answered: 4 }],
      celebrations: [{ topicId: 'greetings', status: 'celebrated' }],
    })
    await expect(page.getByText('выучено 15 из 15')).toBeVisible()
    await page.getByRole('link', { name: 'Настройки' }).click()
    await page.getByRole('button', { name: 'Сбросить прогресс' }).click()
    const dlg = page.getByRole('alertdialog')
    await expect(dlg).toBeVisible()
    await expect(dlg).toContainText('Режим занятий, ваши наборы и слова сохранятся')
    await expect(dlg.getByRole('button', { name: 'Отмена' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dlg).toHaveCount(0)
    expect((await dump(page, 'progress')).length).toBe(15)
    await page.getByRole('button', { name: 'Сбросить прогресс' }).click()
    await page.getByRole('button', { name: 'Отмена' }).click()
    expect((await dump(page, 'progress')).length).toBe(15)
    await page.getByRole('button', { name: 'Сбросить прогресс' }).click()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await expect(page.getByText('Прогресс сброшен')).toBeVisible()
    expect(await dump(page, 'progress')).toHaveLength(0)
    expect(await dump(page, 'days')).toHaveLength(0)
    expect(await dump(page, 'celebrations')).toHaveLength(0)
    await page.getByRole('link', { name: 'Главная' }).click()
    await expect(page.getByText('выучено 0 из 15').first()).toBeVisible()
    await expect(page.locator('.growth')).toHaveAttribute('aria-label', /^Серии нет/)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible() // режим сохранён
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await page.getByRole('button', { name: 'Подсказка' }).waitFor() // reader
  })

  test('после сброса тема получает S04b снова', async ({ page }) => {
    await openWith(page, {
      progress: [
        ...learnedTopic('greetings', ['greetings-15']),
        { wordId: 'greetings-15', box: 3, dueDate: TODAY },
      ],
      celebrations: [{ topicId: 'greetings', status: 'celebrated' }],
    })
    await page.getByRole('link', { name: 'Настройки' }).click()
    await page.getByRole('button', { name: 'Сбросить прогресс' }).click()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await expect(page.getByText('Прогресс сброшен')).toBeVisible()
    await expect.poll(async () => (await dump(page, 'celebrations')).length).toBe(0)
  })
})
