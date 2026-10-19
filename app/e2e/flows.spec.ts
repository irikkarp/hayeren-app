import { expect, test } from '@playwright/test'
import { addDays, dump, know, openWith, showAnswer, TODAY } from './helpers.ts'

test.describe('Онбординг, карточка, режимы (1–13, 34)', () => {
  test('онбординг: оба варианта, режим сохраняется, повторно не показывается', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Учу армянский с нуля/ })).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Понимаю на слух, хочу научиться читать/ }),
    ).toBeVisible()
    await page.getByRole('button', { name: /Понимаю на слух/ }).click()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    await expect(page.getByText('Как вы хотите заниматься?')).toHaveCount(0)
  })

  test('без режима любой маршрут ведёт на онбординг', async ({ page }) => {
    await page.goto('/#/session/topic/greetings')
    await expect(page.getByRole('heading', { name: 'Как вы хотите заниматься?' })).toBeVisible()
    await page.goto('/#/settings')
    await expect(page.getByRole('heading', { name: 'Как вы хотите заниматься?' })).toBeVisible()
  })

  test('главная: 6 тем по order, «выучено 0 из N», 88 слов', async ({ page }) => {
    await openWith(page)
    const names = await page.locator('.list .row .name').allTextContents()
    expect(names).toEqual([
      'Приветствия и вежливость',
      'Числа и цены',
      'Магазин и рынок',
      'Транспорт и такси',
      'Жильё',
      'Кафе и еда',
    ])
    const sizes = await page.locator('.list .row .t-small').allTextContents()
    expect(sizes).toEqual([
      'выучено 0 из 15',
      'выучено 0 из 15',
      'выучено 0 из 15',
      'выучено 0 из 14',
      'выучено 0 из 15',
      'выучено 0 из 14',
    ])
    await expect(page.locator('.stat', { hasText: 'Выучено' }).first()).toContainText('из 88')
  })

  test('beginner: translit на лицевой стороне, перевод скрыт; обратная сторона полная', async ({
    page,
  }) => {
    await openWith(page, { mode: 'beginner' })
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await expect(page.locator('.hy-hero')).toHaveText('բարև')
    await expect(page.locator('.translit')).toHaveText('barev')
    await expect(page.getByText('привет', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Не знаю', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Знаю', exact: true })).toHaveCount(0)
    await showAnswer(page)
    await expect(page.locator('.translit')).toHaveText('barev')
    await expect(page.getByText('привет', { exact: true })).toBeVisible()
    await expect(page.locator('.example [lang="hy"]')).toHaveText('Բարև, ինչպե՞ս ես։')
    await expect(page.getByText('Привет, как ты?')).toBeVisible()
  })

  test('reader: translit скрыта, «Подсказка» показывает её на этой карточке, на следующей снова скрыта', async ({
    page,
  }) => {
    await openWith(page, { mode: 'reader' })
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await expect(page.locator('.translit')).toHaveCount(0)
    await page.getByRole('button', { name: 'Подсказка' }).click()
    await expect(page.locator('.translit')).toHaveText('barev')
    await know(page)
    await expect(page.locator('.translit')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Подсказка' })).toBeVisible()
    await showAnswer(page)
    await expect(page.locator('.translit')).toHaveText('barev dzez')
  })

  test('смена режима в настройках применяется к следующей карточке, прогресс не меняется', async ({
    page,
  }) => {
    await openWith(page, { mode: 'beginner' })
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await know(page)
    await page.goBack()
    await page.getByRole('link', { name: 'Настройки' }).click()
    await page.getByLabel(/Хочу научиться читать/).check()
    await expect(page.getByText('Режим изменён. Применится со следующей карточки')).toBeVisible()
    await page.getByRole('link', { name: 'Главная' }).click()
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await expect(page.getByRole('button', { name: 'Подсказка' })).toBeVisible()
    expect(await dump(page, 'progress')).toHaveLength(1)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Подсказка' })).toBeVisible()
  })

  test('выученная тема: сессия только из долгов; нет долгов — сообщение и возврат к списку', async ({
    page,
  }) => {
    await openWith(page, {
      progress: Array.from({ length: 15 }, (_, i) => ({
        wordId: `greetings-${String(i + 1).padStart(2, '0')}`,
        box: 4,
        dueDate: addDays(TODAY, 3),
      })),
    })
    await expect(page.getByText('✓ Выучена')).toBeVisible()
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await expect(
      page.getByRole('heading', { name: 'В этой теме нечего повторять сегодня' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'К темам' }).click()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
  })

  test('клавиатура в сессии: Пробел — ответ, → «Знаю», ← «Не знаю»', async ({ page }) => {
    await openWith(page)
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await page.getByRole('button', { name: 'Показать ответ' }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Знаю', exact: true })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByText('Осталось: 9')).toBeVisible()
    await page.keyboard.press('Space')
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByText('Знаю · вернёмся к слову', { exact: false })).toHaveCount(0)
    await expect(page.getByText('Не знаю · покажем ещё раз в конце')).toBeVisible()
  })

  test('быстрый двойной клик «Знаю» не записывает два ответа', async ({ page }) => {
    await openWith(page)
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await showAnswer(page)
    await page.getByRole('button', { name: 'Знаю', exact: true }).dblclick()
    await expect.poll(async () => (await dump(page, 'progress')).length).toBeGreaterThan(0)
    const p = await dump(page, 'progress')
    expect(p.length).toBe(1)
    expect(p[0].correct).toBe(1)
  })
})

test.describe('Алфавит (32–33)', () => {
  test('39 букв, ու и և, без упражнений', async ({ page }) => {
    await openWith(page)
    await page.getByRole('link', { name: 'Алфавит' }).click()
    await expect(page.locator('.alpha-table tbody tr')).toHaveCount(39)
    const text = await page.locator('.alpha-table tbody').innerText()
    expect(text).toContain('ու')
    expect(text).toContain('և')
    const hy = await page.locator('.alpha-table tbody tr td:first-child').allInnerTexts()
    expect(hy.length).toBe(39)
    await expect(page.getByRole('button', { name: /Знаю/ })).toHaveCount(0)
  })
})

test.describe('Хранилище недоступно (30) и офлайн (28)', () => {
  test('IndexedDB запрещена: баннер, приложение работает в рамках сессии', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { get: () => undefined })
    })
    await page.goto('/')
    await page.getByRole('button', { name: /Учу армянский с нуля/ }).click()
    await expect(
      page.getByText('Прогресс не сохранится: браузер запрещает хранение данных'),
    ).toBeVisible()
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await know(page)
    await know(page)
    await page.getByRole('button', { name: 'Завершить' }).click()
    await page.getByRole('button', { name: 'К темам' }).click()
    await expect(
      page.getByText('Прогресс не сохранится: браузер запрещает хранение данных'),
    ).toBeVisible()
    await expect(page.locator('.growth')).toHaveAttribute('aria-label', /Серия: 1 день/)
    await expect(page.getByRole('button', { name: 'Повторить (0)' })).toBeDisabled()
  })

  test('IndexedDB бросает ошибку при open: то же поведение', async ({ page }) => {
    await page.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException('denied', 'SecurityError')
      }
    })
    await page.goto('/')
    await page.getByRole('button', { name: /Учу армянский с нуля/ }).click()
    await expect(page.getByText('Прогресс не сохранится')).toBeVisible()
  })

  test('сбой записи: в сессии виден баннер «Не удалось сохранить ответ»', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (
        this: IDBDatabase,
        stores: string | string[],
        mode?: IDBTransactionMode,
      ) {
        if ((window as unknown as { __fail?: boolean }).__fail && mode === 'readwrite') {
          throw new DOMException('quota', 'QuotaExceededError')
        }
        return orig.call(this, stores, mode)
      } as typeof orig
    })
    await page.goto('/')
    await page.getByRole('button', { name: /Учу армянский с нуля/ }).click()
    await page.evaluate(() => ((window as unknown as { __fail: boolean }).__fail = true))
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await know(page)
    await expect(page.getByText('Не удалось сохранить ответ')).toBeVisible()
  })

  test('офлайн после первого открытия: все экраны открываются', async ({ page, context }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await page.reload()
    await page.getByRole('button', { name: /Учу армянский с нуля/ }).click()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    await page.getByRole('link', { name: 'Алфавит' }).click()
    await expect(page.locator('.alpha-table tbody tr')).toHaveCount(39)
    await page.getByRole('link', { name: 'Настройки' }).click()
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible()
    await page.getByRole('link', { name: 'Главная' }).click()
    await page.getByRole('link', { name: /Приветствия/ }).click()
    await know(page)
    await expect(page.getByText('Осталось: 9')).toBeVisible()
    const armenianOk = await page.evaluate(async () => {
      await document.fonts.ready
      return document.fonts.check('700 44px "Noto Serif Armenian"', 'բարև')
    })
    expect(armenianOk).toBe(true)
  })

  test('манифест и иконки (27)', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest')
    expect(res.ok()).toBe(true)
    const m = await res.json()
    expect(m.name).toBeTruthy()
    expect(m.icons.length).toBeGreaterThanOrEqual(2)
    expect(m.display).toBe('standalone')
  })
})

test.describe('Данные и сеть (29, 31)', () => {
  test('прогресс по id, которых нет в словаре, игнорируется без ошибок (31)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await openWith(page, {
      progress: [
        { wordId: 'removed-99', box: 5, dueDate: addDays(TODAY, -3) },
        { wordId: 'shop-01', box: 4, dueDate: addDays(TODAY, -1) },
      ],
    })
    await expect(page.getByRole('button', { name: 'Повторить (1)' })).toBeEnabled()
    await expect(page.locator('.stat', { hasText: 'Выучено' }).locator('.t-stat')).toHaveText('1')
    await page.getByRole('button', { name: 'Повторить (1)' }).click()
    await know(page)
    await expect(page.getByRole('heading', { name: 'Хорошая работа!' })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('приложение не отправляет запросов на сторонние хосты и не шлёт POST/PUT', async ({
    page,
  }) => {
    const reqs: { method: string; url: string }[] = []
    page.on('request', (r) => reqs.push({ method: r.method(), url: r.url() }))
    await page.goto('/')
    await page.getByRole('button', { name: /Учу армянский с нуля/ }).click()
    await page.getByRole('link', { name: /Приветствия/ }).click()
    for (let i = 0; i < 3; i++) await know(page)
    await page.getByRole('button', { name: 'Завершить' }).click()
    await page.getByRole('button', { name: 'К темам' }).click()
    await page.getByRole('link', { name: 'Алфавит' }).click()
    await page.getByRole('link', { name: 'Настройки' }).click()
    expect(reqs.filter((r) => !r.url.startsWith('http://localhost:4173'))).toEqual([])
    expect(reqs.filter((r) => r.method !== 'GET')).toEqual([])
  })

  test('баннер B1 виден и на онбординге', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { get: () => undefined })
    })
    await page.goto('/')
    await expect(page.getByText('Прогресс не сохранится')).toBeVisible()
    await expect(page.getByRole('button', { name: /Учу армянский с нуля/ })).toBeVisible()
  })
})
