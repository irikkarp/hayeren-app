import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { dumpUser, openWith, type Seed } from './helpers.ts'

const NOTE =
  'В файл попадут наборы, слова, переводы, транслитерация и примеры. Прогресс повторения (что вы уже выучили) не сохраняется: после загрузки файла все слова будут новыми.'

/** Данные критерия 104: два набора и более, «трудные» значения, пустой набор. */
const HARD: Seed = {
  userSets: [
    { id: 's1', title: 'Урок 5', createdAt: 1000 },
    { id: 's2', title: 'Кухня и еда', createdAt: 2000 },
    { id: 's3', title: 'Пустой', createdAt: 3000 },
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
    {
      id: 'u-2',
      setId: 's1',
      hy: 'տուն',
      ru: 'дом, жильё; ещё "дом"',
      translit: 'tun',
      translitAuto: false,
      exampleHy: 'Տունը մեծ է։',
      exampleRu: 'Дом большой.',
      createdAt: 1002,
    },
    { id: 'u-3', setId: 's1', hy: 'եւ', ru: '-ый суффикс', createdAt: 1003 },
    { id: 'u-4', setId: 's1', hy: 'հաց', ru: "'=хлеб", createdAt: 1004 },
    {
      id: 'u-5',
      setId: 's2',
      hy: 'ջուր',
      ru: 'вода 🙂 +1',
      exampleHy: 'Ջուրը սառն է։',
      exampleRu: '@' + 'я'.repeat(150),
      createdAt: 2001,
    },
    { id: 'u-6', setId: 's2', hy: 'թեյ', ru: '=чай ' + 'ю'.repeat(90), createdAt: 2002 },
  ],
}

async function exportViaButton(page: Page, name: string) {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name, exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()
  return { name: download.suggestedFilename(), bytes: readFileSync(path) }
}

test.describe('Экспорт в CSV: настройки (88–89, 97–100)', () => {
  test('без своих слов: кнопка недоступна, пояснения видны, даты копии нет', async ({ page }) => {
    await openWith(page)
    await page.goto('/#/settings')
    await expect(page.getByRole('heading', { name: 'Резервная копия' })).toBeVisible()
    await expect(page.getByText(NOTE)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Экспортировать все свои слова' })).toBeDisabled()
    await expect(page.getByText('Пока нечего экспортировать: добавьте свои слова')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Экспортировать', exact: true })).toBeDisabled()
    await expect(page.getByText('Копия ещё не сохранялась')).toBeVisible()
    await expect(
      page.getByText('Загрузить копию обратно: «Добавить слова» → «Импорт из файла»'),
    ).toBeVisible()
    await expect(page.getByText('Сохраните резервную копию.')).toBeVisible()
  })

  test('экспорт всех: файл, формат, имя, тост 10 с с «Закрыть», дата копии переживает перезагрузку и сброс прогресса', async ({
    page,
  }) => {
    await openWith(page, HARD)
    await page.goto('/#/settings')
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await page.context().setOffline(true) // 100: без сети
    const file = await exportViaButton(page, 'Экспортировать все свои слова')
    await page.context().setOffline(false)
    expect(requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([])

    expect(file.name).toBe('hayeren-words-2026-10-19.csv')
    expect([...file.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = file.bytes.toString('utf8').slice(1)
    expect(text.split('\r\n')[0]).toBe('set;hy;ru;translit;example_hy;example_ru')
    expect(text.split('\r\n')[1]).toBe('Урок 5;բարև;привет;barev;;')
    expect(text).toContain('Урок 5;տուն;"дом, жильё; ещё ""дом""";tun;Տունը մեծ է։;Дом большой.')
    expect(text).toContain("Урок 5;եւ;'-ый суффикс;;;")
    expect(text).toContain("Урок 5;հաց;''=хлеб;;;")
    expect(text).toContain("Кухня и еда;ջուր;вода 🙂 +1;;Ջուրը սառն է։;'@" + 'я'.repeat(150))
    expect(text).not.toContain('Пустой')
    expect(text.endsWith('\r\n')).toBe(true)

    const toast = page.getByRole('status')
    await expect(toast).toContainText('Файл сохранён. Прогресс в файл не входит.')
    await expect(page.getByText('Последняя копия: 19.10.2026')).toBeVisible()
    await toast.getByRole('button', { name: 'Закрыть' }).click()
    await expect(toast).toHaveCount(0)

    await page.reload()
    await expect(page.getByText('Последняя копия: 19.10.2026')).toBeVisible()
    await page.getByRole('button', { name: 'Сбросить прогресс' }).click()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await expect(page.getByText('Последняя копия: 19.10.2026')).toBeVisible()
  })

  test('кнопка-ссылка «Экспортировать» в заметке запускает тот же экспорт (98)', async ({
    page,
  }) => {
    await openWith(page, HARD)
    await page.goto('/#/settings')
    const file = await exportViaButton(page, 'Экспортировать')
    expect(file.name).toBe('hayeren-words-2026-10-19.csv')
    await page.getByRole('button', { name: 'Закрыть' }).click()
    await page.goto('/#/add')
    await expect(page.getByText('Сохраните резервную копию.')).toBeVisible()
    const again = await exportViaButton(page, 'Экспортировать')
    expect(again.bytes.equals(file.bytes)).toBe(true)
  })

  test('ошибка создания файла: сообщение под кнопкой, исчезает после удачной попытки и при уходе с экрана', async ({
    page,
  }) => {
    await openWith(page, HARD)
    await page.goto('/#/settings')
    await page.evaluate(() => {
      ;(window as unknown as { realCreate: typeof URL.createObjectURL }).realCreate =
        URL.createObjectURL
      URL.createObjectURL = () => {
        throw new Error('нет места')
      }
    })
    const button = page.getByRole('button', { name: 'Экспортировать все свои слова' })
    await button.click()
    const alert = page.getByRole('alert')
    await expect(alert).toHaveText('Не удалось создать файл. Попробуйте ещё раз')
    await expect(page.locator('.toast')).toHaveCount(0)
    await page.clock.fastForward(60_000)
    await expect(alert).toBeVisible()
    await expect(page.getByText('Копия ещё не сохранялась')).toBeVisible()
    expect((await dumpUser(page)).words).toHaveLength(6)

    await page.evaluate(() => {
      const w = window as unknown as { realCreate: typeof URL.createObjectURL }
      URL.createObjectURL = w.realCreate
    })
    await button.click()
    await expect(page.getByRole('status')).toContainText('Файл сохранён')
    await expect(alert).toHaveCount(0)

    // Новая ошибка и уход с экрана.
    await page.evaluate(() => {
      URL.createObjectURL = () => {
        throw new Error('x')
      }
    })
    await page.getByRole('button', { name: 'Закрыть' }).click()
    await button.click()
    await expect(alert).toBeVisible()
    await page.goto('/#/')
    await page.goto('/#/settings')
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})

test.describe('Экспорт набора (88–90, 96)', () => {
  test('только слова набора; имя с названием; символы / и : заменяются', async ({ page }) => {
    await openWith(page, {
      userSets: [{ id: 's1', title: 'Урок 5/6: часть', createdAt: 1000 }, HARD.userSets![1]],
      userWords: [
        { id: 'u-1', setId: 's1', hy: 'բարև', ru: 'привет', createdAt: 1001 },
        { id: 'u-2', setId: 's2', hy: 'հաց', ru: 'хлеб', createdAt: 2001 },
      ],
    })
    await page.goto('/#/sets/s1')
    await expect(page.getByText(NOTE)).toBeVisible()
    const file = await exportViaButton(page, 'Экспортировать набор')
    expect(file.name).toBe('hayeren-words-Урок 5_6_ часть-2026-10-19.csv')
    const text = file.bytes.toString('utf8')
    expect(text).toContain('Урок 5/6: часть;')
    expect(text).not.toContain('хлеб')
    await expect(page.getByRole('status')).toContainText(
      'Файл сохранён. Прогресс в файл не входит.',
    )
  })

  test('пустой набор: кнопка недоступна, рядом «В наборе нет слов»', async ({ page }) => {
    await openWith(page, HARD)
    await page.goto('/#/sets/s3')
    await expect(page.getByRole('button', { name: 'Экспортировать набор' })).toBeDisabled()
    await expect(page.getByText('В наборе нет слов')).toBeVisible()
    await expect(page.getByText(NOTE)).toBeVisible()
  })
})

test.describe('Сохранение на iOS в установленном PWA (109)', () => {
  test('есть canShare({files}): открывается меню «Поделиться» с файлом, ссылка загрузки не используется', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      })
      Object.defineProperty(navigator, 'standalone', { get: () => true })
      const w = window as unknown as { shared: { name: string; type: string; size: number }[] }
      w.shared = []
      navigator.canShare = (d?: ShareData) => !!d?.files?.length
      navigator.share = async (d?: ShareData) => {
        for (const f of d!.files!) w.shared.push({ name: f.name, type: f.type, size: f.size })
      }
    })
    await openWith(page, HARD)
    await page.goto('/#/settings')
    let downloads = 0
    page.on('download', () => downloads++)
    await page.getByRole('button', { name: 'Экспортировать все свои слова' }).click()
    await expect(page.getByRole('status')).toContainText('Файл сохранён')
    const shared = await page.evaluate(() => (window as unknown as { shared: unknown[] }).shared)
    expect(shared).toMatchObject([{ name: 'hayeren-words-2026-10-19.csv', type: 'text/csv' }])
    expect(downloads).toBe(0)
    await expect(page.getByText('Последняя копия: 19.10.2026')).toBeVisible()
  })

  test('пользователь закрыл меню «Поделиться»: без сообщений, дата не меняется', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      })
      Object.defineProperty(navigator, 'standalone', { get: () => true })
      navigator.canShare = () => true
      navigator.share = async () => {
        throw new DOMException('cancelled', 'AbortError')
      }
    })
    await openWith(page, HARD)
    await page.goto('/#/settings')
    await page.getByRole('button', { name: 'Экспортировать все свои слова' }).click()
    await expect(page.getByRole('button', { name: 'Экспортировать все свои слова' })).toBeEnabled()
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('Копия ещё не сохранялась')).toBeVisible()
  })
})

test.describe('Сквозной тест: экспорт → удаление → импорт (104–106)', () => {
  test('те же наборы, слова, порядок, поля и метка «авто»; прогресс не восстанавливается', async ({
    page,
  }) => {
    await openWith(page, {
      ...HARD,
      progress: [{ wordId: 'u-1', box: 4, dueDate: '2026-12-01' }],
    })
    const before = await dumpUser(page)
    await page.goto('/#/settings')
    const file = await exportViaButton(page, 'Экспортировать все свои слова')

    // Удаляем все свои наборы через интерфейс.
    for (const id of ['s1', 's2', 's3']) {
      await page.goto(`/#/sets/${id}`)
      await page.getByRole('button', { name: 'Удалить набор' }).click()
      await page.getByRole('button', { name: 'Удалить', exact: true }).click()
      await expect(page.getByText('Набор удалён')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    }
    expect((await dumpUser(page)).sets).toHaveLength(0)

    await page.goto('/#/add/file')
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: file.name, mimeType: 'text/csv', buffer: file.bytes })
    await expect(page.getByText('Колонки определены по заголовкам.')).toBeVisible()
    await expect(page.getByLabel('Первая строка — заголовки')).toBeChecked()
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.getByText('Распознано: 6')).toBeVisible()
    await expect(page.getByText('Новых наборов: 2')).toBeVisible()
    await page.getByRole('button', { name: 'Сохранить 6 слов' }).click()
    await expect(page.getByText('Сохранено: 6 слов, 2 набора')).toBeVisible()

    const after = await dumpUser(page)
    expect(after.sets.map((s) => s.title)).toEqual(['Урок 5', 'Кухня и еда'])
    const fields = (d: typeof before, setTitle: Map<unknown, unknown>) =>
      d.words.map((w) => ({
        set: setTitle.get(w.setId),
        hy: w.hy,
        ru: w.ru,
        translit: w.translitAuto ? '' : w.translit,
        auto: w.translitAuto,
        exampleHy: w.exampleHy,
        exampleRu: w.exampleRu,
      }))
    const titles = (d: typeof before) => new Map(d.sets.map((s) => [s.id, s.title]))
    expect(fields(after, titles(after))).toEqual(
      fields(before, titles(before)).filter((w) => w.set !== 'Пустой'),
    )
    expect(after.progress).toHaveLength(0)

    // Повторная загрузка того же файла: все строки «Уже есть в наборе», ничего не отмечено (105).
    await page.goto('/#/add/file')
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: file.name, mimeType: 'text/csv', buffer: file.bytes })
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.locator('.pv-row .chip-warn')).toHaveCount(6)
    await expect(page.locator('.pv-row input:checked')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Сохранить 0 слов' })).toBeDisabled()
  })

  test('файл одного набора загружается в чистое приложение (106)', async ({ page, browser }) => {
    await openWith(page, HARD)
    await page.goto('/#/sets/s1')
    const file = await exportViaButton(page, 'Экспортировать набор')
    expect(file.name).toBe('hayeren-words-Урок 5-2026-10-19.csv')

    const ctx = await browser.newContext()
    const fresh = await ctx.newPage()
    await openWith(fresh)
    await fresh.goto('/#/add/file')
    await fresh
      .locator('input[type=file]')
      .setInputFiles({ name: file.name, mimeType: 'text/csv', buffer: file.bytes })
    await fresh.getByRole('button', { name: 'Далее' }).click()
    await fresh.getByRole('button', { name: 'Сохранить 4 слова' }).click()
    const saved = await dumpUser(fresh)
    expect(saved.sets.map((s) => s.title)).toEqual(['Урок 5'])
    expect(saved.words.map((w) => w.hy)).toEqual(['բարև', 'տուն', 'եւ', 'հաց'])
    expect(saved.words.map((w) => w.translitAuto)).toEqual([false, false, true, true])
    expect(saved.words[3].ru).toBe("'=хлеб")
    await ctx.close()
  })
})

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [320, 360]) {
    test.describe(`экспорт: ${scheme} ${width}px`, () => {
      test.use({ colorScheme: scheme, viewport: { width, height: 640 } })

      test('настройки и экран набора: без горизонтальной прокрутки, axe, цели касания', async ({
        page,
      }) => {
        await openWith(page, HARD)
        const check = async (label: string) => {
          const m = await page.evaluate(() => ({
            sw: document.documentElement.scrollWidth,
            iw: window.innerWidth,
          }))
          expect(m.sw, `h-scroll ${label}`).toBeLessThanOrEqual(m.iw)
          const res = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
          expect(
            res.violations.map(
              (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('|')}`,
            ),
            `axe ${label}`,
          ).toEqual([])
          const small = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('button, a[href]')]
              .filter(
                (el) => !el.classList.contains('chip') && el.getBoundingClientRect().width > 0,
              )
              .filter((el) => el.getBoundingClientRect().height < 43.5)
              .map((el) => el.textContent?.trim()),
          )
          expect(small, `tap ${label}`).toEqual([])
        }
        await page.goto('/#/settings')
        await check('settings')
        await page.getByRole('button', { name: 'Экспортировать все свои слова' }).click()
        await expect(page.getByRole('status')).toContainText('Файл сохранён')
        await check('settings + toast')
        await page.goto('/#/sets/s1')
        await check('set')
        await page.goto('/#/sets/s3')
        await check('empty set')
        await page.goto('/#/add')
        await check('add')
      })

      test('пустые настройки', async ({ page }) => {
        await openWith(page)
        await page.goto('/#/settings')
        const res = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
        expect(res.violations.map((v) => v.id)).toEqual([])
      })
    })
  }
}
