// QA этапа 2 (docs/qa/002-stage2-report.md): граничные случаи, безопасность, сбои, офлайн, доступность.
// Блок «Баги этапа 2» ниже: бывшие test.fail(), баги исправлены, теперь это регрессионные тесты.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { dumpUser, openWith, TODAY } from './helpers.ts'
import { buildXlsx, type XCell } from './xlsxBuilder.ts'

const buf = (s: string) => Buffer.from(s)

async function pasteAndParse(page: Page, text: string) {
  await page.goto('/#/add/paste')
  await page.getByLabel('Слова по одному на строке').fill(text)
  await page.getByRole('button', { name: 'Разобрать' }).click()
  await expect(page.getByRole('heading', { name: 'Проверьте список' })).toBeVisible()
}

/** Загружает файл на экран импорта; возвращает тексты видимых предупреждений. */
async function upload(page: Page, name: string, data: Buffer | string) {
  await page.goto('/#/add/file')
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'application/octet-stream',
    buffer: typeof data === 'string' ? buf(data) : data,
  })
  await expect(
    page
      .getByRole('alert')
      .or(page.getByRole('heading', { name: 'Что в колонках' }))
      .first(),
  ).toBeVisible()
  return page.getByRole('alert').allInnerTexts()
}

async function checkAxe(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(
    res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    `axe: ${label}`,
  ).toEqual([])
}

const SET = { id: 's1', title: 'Урок', createdAt: 1000 }

test.describe('Безопасность импорта', () => {
  test('XSS: HTML и скрипты во вставке и в названии набора показываются как текст', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      ;(window as unknown as Record<string, number>).__xss = 0
    })
    await openWith(page)
    await pasteAndParse(
      page,
      [
        'բարև — <img src=x onerror="window.__xss=1">',
        'հաց — <script>window.__xss=2</script>',
        'կաթ — "><iframe srcdoc="<script>parent.__xss=4</script>">',
      ].join('\n'),
    )
    await page.getByLabel('Название нового набора').fill('<img src=x onerror=window.__xss=5>')
    await page.getByRole('button', { name: 'Сохранить 3 слова' }).click()
    await expect(page.locator('.word-row').first()).toContainText('<img src=x onerror=')
    await page.goto('/#/')
    await expect(page.locator('.set-row')).toContainText('<img src=x onerror=window.__xss=5>')
    await page.getByRole('link', { name: /Учить набор/ }).click()
    await page.getByRole('button', { name: 'Показать ответ' }).click()
    await expect(page.locator('body')).toContainText('<img src=x onerror=')
    expect(await page.evaluate(() => (window as unknown as Record<string, number>).__xss)).toBe(0)
    await expect(page.locator('img[src="x"], iframe[srcdoc]')).toHaveCount(0)
  })

  test('формулы: =, +, -, @ в CSV остаются текстом, апостроф снимается только по критерию 95', async ({
    page,
  }) => {
    await openWith(page)
    const csv = [
      'hy;ru',
      'բարև;=HYPERLINK("http://evil.example")',
      'հաց;+1+1',
      'ջուր;@SUM(A1)',
      "կաթ;'-ый суффикс",
      "թեյ;''=x",
      "սուրճ;'обычный апостроф",
    ].join('\n')
    expect(await upload(page, 'f.csv', csv)).toEqual([])
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: 'Сохранить 6 слов' }).click()
    await expect(page.getByRole('heading', { name: /Набор от/ })).toBeVisible()
    const saved = await dumpUser(page)
    expect(saved.words.map((w) => w.ru)).toEqual([
      '=HYPERLINK("http://evil.example")',
      '+1+1',
      '@SUM(A1)',
      '-ый суффикс',
      "'=x",
      "'обычный апостроф",
    ])
  })

  test('xlsx: формула без сохранённого результата и ячейка с ошибкой дают «Нет перевода», а не мусор', async ({
    page,
  }) => {
    await openWith(page)
    const rows: XCell[][] = [
      ['hy', 'ru'],
      ['բարև', { f: 'A1&"x"' }],
      ['հաց', { err: '#DIV/0!' }],
      ['ջուր', { f: '"во"&"да"', v: 'вода' }],
      ['=HYPERLINK("http://x")', '=1+1'],
    ]
    expect(await upload(page, 'e.xlsx', buildXlsx([{ name: 'A', rows }]))).toEqual([])
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.getByText('Распознано: 1, с ошибками: 3')).toBeVisible()
    const errs = page.locator('.err-row')
    await expect(errs.nth(0)).toContainText('Нет перевода')
    await expect(errs.nth(1)).toContainText('Нет перевода')
    await expect(errs.nth(2)).toContainText('Здесь нужно слово армянскими буквами')
  })
})

test.describe('Файлы: границы и особые случаи', () => {
  test('граничные размеры: ровно 5 МБ и 3000 строк xlsx принимаются, 3001 строка xlsx — нет', async ({
    page,
  }) => {
    await openWith(page)
    const head = 'hy;ru\n'
    const body = Array.from({ length: 1000 }, (_, i) => `ա${i};${'я'.repeat(100)}`).join('\n')
    const pad = 5 * 1024 * 1024 - Buffer.byteLength(head + body)
    const five = buf(head + body + ' '.repeat(pad))
    expect(five.length).toBe(5 * 1024 * 1024)
    expect(await upload(page, 'five.csv', five)).toEqual([])

    const rows = (n: number): XCell[][] => [
      ['hy', 'ru'],
      ...Array.from({ length: n }, (_, i) => [`ա${i}`, `в${i}`] as XCell[]),
    ]
    expect(await upload(page, 'ok.xlsx', buildXlsx([{ name: 'A', rows: rows(3000) }]))).toEqual([])
    const over = await upload(page, 'big.xlsx', buildXlsx([{ name: 'A', rows: rows(3001) }]))
    expect(over.join()).toContain('В файле 3001 строк, максимум 3000. Разделите файл на части.')
  })

  test('ошибки чтения: пароль (OLE-контейнер), пустой xlsx, UTF-16, .txt, .xlsm', async ({
    page,
  }) => {
    await openWith(page)
    const ole = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(2000),
    ])
    expect((await upload(page, 'p.xlsx', ole)).join()).toContain('не защищён паролем')
    expect((await upload(page, 'a.xlsx', buildXlsx([{ name: 'A', rows: [] }]))).join()).toContain(
      'В файле нет данных',
    )
    const utf16 = Buffer.from('﻿hy;ru\nբարև;привет\n', 'utf16le')
    expect((await upload(page, 'u.csv', utf16)).join()).toContain('Файл не в кодировке UTF-8')
    for (const name of ['x.txt', 'x.xlsm', 'x.csv.xls', 'x.numbers']) {
      expect((await upload(page, name, 'hy;ru\nբարև;привет\n')).join(), name).toContain(
        'Старый формат .xls пересохраните в Excel как .xlsx.',
      )
    }
  })

  test('CSV: «;» и «,» внутри значений, переводы строк в кавычках, регистр расширения', async ({
    page,
  }) => {
    await openWith(page)
    const csv = 'hy,ru\r\nբարև,"привет; здравствуй"\r\nհաց,"хлеб,\r\nбулка"\r\n'
    expect(await upload(page, 'L.CSV', csv)).toEqual([])
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.getByText('Распознано: 2')).toBeVisible()
    await page.getByRole('button', { name: 'Сохранить 2 слова' }).click()
    await expect(page.getByRole('heading', { name: /Набор от/ })).toBeVisible()
    const saved = await dumpUser(page)
    expect(saved.words.map((w) => w.ru)).toEqual(['привет; здравствуй', 'хлеб, булка'])
  })

  test('колонка «Набор»: регистр и пробелы, существующий набор, длинное название, пустая ячейка', async ({
    page,
  }) => {
    await openWith(page, {
      userSets: [{ id: 'old', title: 'УРОК 1', createdAt: 1000 }],
      userWords: [{ id: 'u-old', setId: 'old', hy: 'բարև', ru: 'привет', createdAt: 1001 }],
    })
    const csv = [
      'set;hy;ru',
      'урок 1;բարև;привет',
      'урок 1;հաց;хлеб',
      'Урок 2;հաց;хлеб',
      'урок 2 ;ջուր;вода',
      'УРОК 2;ջուր;вода2',
      `${'Н'.repeat(51)};կաթ;молоко`,
      ';թեյ;чай',
      '  ;սուրճ;кофе',
    ].join('\n')
    expect(await upload(page, 's.csv', csv)).toEqual([])
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.getByText(/Распознано: 7, с ошибками: 1/)).toBeVisible()
    await expect(page.getByText('Название набора длиннее 50 символов')).toBeVisible()
    // «Урок 2» и набор по умолчанию (для двух строк с пустой ячейкой)
    await expect(page.getByText('Новых наборов: 2')).toBeVisible()
    await expect(page.locator('.pv-row', { hasText: 'Уже есть в наборе' })).toHaveCount(1)
    await page.getByLabel('Название нового набора').fill('Остальное')
    await page.getByRole('button', { name: /Сохранить 5 слов/ }).click()
    await expect(page.getByText(/Сохранено: 5 слов, 3 набора/)).toBeVisible()
    const saved = await dumpUser(page)
    const titleOf = (id: unknown) => saved.sets.find((s) => s.id === id)?.title
    expect(saved.sets.map((s) => s.title)).toEqual(['УРОК 1', 'Урок 2', 'Остальное'])
    expect(saved.words.map((w) => [w.hy, titleOf(w.setId)])).toEqual([
      ['բարև', 'УРОК 1'],
      ['հաց', 'УРОК 1'],
      ['հաց', 'Урок 2'],
      ['ջուր', 'Урок 2'],
      ['թեյ', 'Остальное'],
      ['սուրճ', 'Остальное'],
    ])
  })

  test('офлайн: ленивый чанк xlsx после установки service worker, сохранение без сети', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await page.reload()
    await page.getByRole('button', { name: /Учу армянский с нуля/ }).click()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await context.setOffline(true)
    await page.reload()
    const rows: XCell[][] = [
      ['hy', 'ru'],
      ['բարև', 'привет'],
    ]
    expect(await upload(page, 'o.xlsx', buildXlsx([{ name: 'A', rows }]))).toEqual([])
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: 'Сохранить 1 слово' }).click()
    await expect(page.getByRole('heading', { name: /Набор от/ })).toBeVisible()
    expect((await dumpUser(page)).words).toHaveLength(1)
  })
})

test.describe('Хранилище, сбои, лимиты', () => {
  test('persist() вызывается при первом сохранении; отказ браузера не мешает', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as Record<string, number>).__persist = 0
      navigator.storage.persist = () => {
        ;(window as unknown as Record<string, number>).__persist++
        return Promise.reject(new Error('denied'))
      }
    })
    await openWith(page)
    await pasteAndParse(page, 'բարև — привет')
    await page.getByRole('button', { name: 'Сохранить 1 слово' }).click()
    await expect(page.getByRole('heading', { name: /Набор от/ })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as Record<string, number>).__persist)).toBe(
      1,
    )
    expect((await dumpUser(page)).words).toHaveLength(1)
  })

  test('IndexedDB недоступна: свои слова работают в рамках сессии, баннер виден', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })
    })
    await page.goto('/')
    await page.getByRole('button', { name: /Учу армянский с нуля/ }).click()
    await expect(page.getByText('Прогресс не сохранится')).toBeVisible()
    await pasteAndParse(page, 'բարև — привет\nհաց — хлеб')
    await page.getByRole('button', { name: 'Сохранить 2 слова' }).click()
    await expect(page.locator('.word-row')).toHaveCount(2)
    await expect(page.getByText('Прогресс не сохранится')).toBeVisible()
    await page.getByRole('link', { name: 'Учить', exact: true }).click()
    await expect(page.locator('.hy-hero')).toHaveText('բարև')
  })

  test('сбой записи: ошибка, данные и предпросмотр остаются, повтор проходит; удаление набора при сбое', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const orig = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (
        this: IDBDatabase,
        stores: string | string[],
        mode?: IDBTransactionMode,
      ) {
        if ((window as unknown as Record<string, boolean>).__fail && mode === 'readwrite') {
          throw new DOMException('quota', 'QuotaExceededError')
        }
        return orig.call(this, stores as string[], mode)
      } as typeof orig
    })
    const fail = (v: boolean) =>
      page.evaluate((x) => ((window as unknown as Record<string, boolean>).__fail = x), v)
    await openWith(page)
    await pasteAndParse(page, 'բարև — привет')
    await fail(true)
    await page.getByRole('button', { name: 'Сохранить 1 слово' }).click()
    await expect(page.getByRole('alert')).toContainText('Не удалось сохранить слова')
    await expect(page.locator('.pv-row')).toHaveCount(1)
    await fail(false)
    await page.getByRole('button', { name: 'Сохранить 1 слово' }).click()
    await expect(page.getByRole('heading', { name: /Набор от/ })).toBeVisible()

    await page.goto('/#/add/word')
    await page.getByLabel('Армянское слово').fill('հաց')
    await page.getByLabel('Перевод', { exact: true }).fill('хлеб')
    await fail(true)
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByRole('alert')).toContainText('Не удалось сохранить слово')
    await expect(page.getByLabel('Армянское слово')).toHaveValue('հաց')

    await page.goto('/#/')
    await page.locator('.set-main').first().click()
    await page.getByRole('button', { name: 'Удалить набор' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click()
    await expect(page.getByText('Не удалось удалить набор')).toBeVisible()
    expect((await dumpUser(page)).sets).toHaveLength(1)
  })

  test('лимит 100 наборов: вставка и форма, ничего не сохраняется, данные остаются', async ({
    page,
  }) => {
    const sets = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      title: `Набор ${i}`,
      createdAt: 1000 + i,
    }))
    await openWith(page, { userSets: sets })
    await pasteAndParse(page, 'բարև — привет')
    await page.getByLabel('Сохранить в набор').selectOption({ label: 'Новый набор…' })
    await page.getByLabel('Название нового набора').fill('Сто первый')
    await page.getByRole('button', { name: 'Сохранить 1 слово' }).click()
    await expect(page.getByRole('alert')).toContainText('Можно создать не больше 100 наборов.')
    await expect(page.getByRole('heading', { name: 'Проверьте список' })).toBeVisible()

    await page.goto('/#/add/word')
    await page.getByLabel('Армянское слово').fill('հաց')
    await page.getByLabel('Перевод', { exact: true }).fill('хлеб')
    await page.getByLabel('Набор').selectOption({ label: 'Новый набор…' })
    await page.getByLabel('Название нового набора').fill('Сто первый')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByRole('alert')).toContainText('Можно создать не больше 100 наборов.')
    const saved = await dumpUser(page)
    expect(saved.sets).toHaveLength(100)
    expect(saved.words).toHaveLength(0)
  })

  test('дневной лимит новых слов общий для встроенных тем и своего набора', async ({ page }) => {
    await openWith(page, {
      userSets: [SET],
      userWords: Array.from({ length: 12 }, (_, i) => ({
        id: `u-${i}`,
        setId: 's1',
        hy: 'ա' + 'բ'.repeat(i + 1),
        ru: `в${i}`,
        createdAt: 1001 + i,
      })),
      days: [{ date: TODAY, answered: 10, newStarted: 10 }],
    })
    await page.goto('/#/session/set/s1')
    await expect(
      page.getByText('На сегодня новых слов достаточно. Возвращайтесь завтра'),
    ).toBeVisible()
    await page.getByRole('button', { name: /Учить ещё 10/ }).click()
    await expect(page.getByText('Осталось: 10')).toBeVisible()
  })

  test('«Сбросить прогресс» сохраняет свои наборы и слова, прогресс и серия обнуляются', async ({
    page,
  }) => {
    await openWith(page, {
      userSets: [SET],
      userWords: [{ id: 'u-1', setId: 's1', hy: 'բարև', ru: 'привет', createdAt: 1001 }],
      progress: [{ wordId: 'u-1', box: 4, dueDate: '2026-10-30' }],
      days: [
        { date: '2026-10-18', answered: 3 },
        { date: '2026-10-17', answered: 3 },
      ],
    })
    await page.goto('/#/settings')
    await page.getByRole('button', { name: 'Сбросить прогресс' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('ваши наборы и слова сохранятся')
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Сбросить', exact: true })
      .click()
    await expect(page.getByText('Прогресс сброшен')).toBeVisible()
    const saved = await dumpUser(page)
    expect(saved.sets).toHaveLength(1)
    expect(saved.words).toHaveLength(1)
    expect(saved.progress).toHaveLength(0)
    await page.goto('/#/')
    await expect(page.locator('.set-row')).toContainText('выучено 0 из 1')
  })
})

test.describe('Карточка своего слова', () => {
  test('режим reader: подсказка показывает транслитерацию с меткой «авто»; блок примера только при наличии', async ({
    page,
  }) => {
    await openWith(page, {
      mode: 'reader',
      userSets: [SET],
      userWords: [
        {
          id: 'u-1',
          setId: 's1',
          hy: 'բարև',
          ru: 'привет',
          translit: 'barev',
          translitAuto: true,
          createdAt: 1001,
        },
        {
          id: 'u-2',
          setId: 's1',
          hy: 'հաց',
          ru: 'хлеб',
          translit: "hats'",
          translitAuto: false,
          exampleHy: 'Հացը համեղ է։',
          createdAt: 1002,
        },
      ],
    })
    await page.goto('/#/session/set/s1')
    await expect(page.locator('.translit')).toHaveCount(0)
    await page.getByRole('button', { name: /Подсказка/ }).click()
    await expect(page.locator('.translit')).toContainText('barev')
    await page.getByRole('button', { name: 'авто' }).click()
    await expect(page.getByText(/создана автоматически/)).toBeVisible()
    await page.getByRole('button', { name: 'Показать ответ' }).click()
    await expect(page.getByText('Пример', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Знаю', exact: true }).click()
    await page.getByRole('button', { name: 'Показать ответ' }).click()
    await expect(page.getByText('Пример', { exact: true })).toBeVisible()
    await expect(page.getByText('Հացը համեղ է։')).toBeVisible()
  })
})

test.describe('Клавиатура и фокус', () => {
  test('форма: Enter сохраняет, фокус возвращается в «Армянское слово», ошибка ставит фокус на первое поле', async ({
    page,
  }) => {
    await openWith(page, { userSets: [SET] })
    await page.goto('/#/add/word?set=s1')
    await page.getByLabel('Армянское слово').fill('ջուր')
    await page.getByLabel('Перевод', { exact: true }).press('Enter')
    await expect(page.getByLabel('Перевод', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await expect(page.getByLabel('Перевод', { exact: true })).toBeFocused()
    await page.getByLabel('Перевод', { exact: true }).fill('вода')
    await page.getByLabel('Перевод', { exact: true }).press('Enter')
    await expect(page.getByText('Слово добавлено в «Урок»')).toBeVisible()
    await expect(page.getByLabel('Армянское слово')).toBeFocused()
    await expect(page.getByLabel('Армянское слово')).toHaveValue('')
    expect((await dumpUser(page)).words).toHaveLength(1)
  })

  test('диалоги: Esc закрывает, фокус возвращается на кнопку; Enter в «Переименовать» сохраняет', async ({
    page,
  }) => {
    await openWith(page, {
      userSets: [SET],
      userWords: [{ id: 'u-1', setId: 's1', hy: 'բարև', ru: 'привет', createdAt: 1001 }],
    })
    await page.goto('/#/sets/s1')
    await page.getByRole('button', { name: 'Переименовать' }).click()
    await expect(page.getByLabel('Название')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Переименовать' })).toBeFocused()
    await page.getByRole('button', { name: 'Удалить набор' }).click()
    await expect(page.getByRole('button', { name: 'Отмена' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Удалить набор' })).toBeFocused()
    await page.getByRole('button', { name: 'Переименовать' }).click()
    await page.getByLabel('Название').fill('Новое')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Новое' })).toBeVisible()
  })

  test('предпросмотр: флажки и кнопки достижимы по Tab, у каждого есть видимый индикатор фокуса', async ({
    page,
  }) => {
    await openWith(page)
    await pasteAndParse(page, 'բարև — привет\nհաց — хлеб\nshuka — рынок')
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    const seen: string[] = []
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const vis = (c: CSSStyleDeclaration) =>
          (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== 'none'
        const lab = el.closest('label')
        const sib = el.nextElementSibling
        return {
          body: el === document.body,
          name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30),
          ok:
            vis(getComputedStyle(el)) ||
            (!!lab && vis(getComputedStyle(lab))) ||
            (!!sib && vis(getComputedStyle(sib))),
        }
      })
      if (info.body) break // дошли до конца страницы
      seen.push(info.name)
      expect(info.ok, `индикатор фокуса: ${info.name}`).toBe(true)
    }
    expect(new Set(seen).size, seen.join(' | ')).toBeGreaterThanOrEqual(6)
  })
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe на дополнительных состояниях: ${scheme} 320px`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 320, height: 640 } })

    test('ошибки импорта, пустой предпросмотр, все дубликаты, колонки с двумя листами, ошибки формы', async ({
      page,
    }) => {
      await openWith(page, {
        userSets: [SET],
        userWords: [{ id: 'u-1', setId: 's1', hy: 'բարև', ru: 'привет', createdAt: 1001 }],
      })
      await upload(page, 'x.xls', 'x')
      await checkAxe(page, 'S13 ошибка формата')
      await upload(
        page,
        'two.xlsx',
        buildXlsx([
          {
            name: 'Лист1',
            rows: [
              ['hy', 'ru', 'set'],
              ['բարև', 'привет', 'Урок'],
            ],
          },
          { name: 'Лист2', rows: [['x']] },
        ]),
      )
      await expect(page.getByText('Импортирован первый лист «Лист1»')).toBeVisible()
      await checkAxe(page, 'S14 два листа')
      await page.getByRole('button', { name: 'Далее' }).click()
      await expect(page.getByText('Эти слова уже есть в приложении')).toBeVisible()
      await checkAxe(page, 'S11 все дубликаты, набор из колонки')
      await pasteAndParse(page, 'просто текст')
      await expect(page.getByText('Ни одной строки не удалось распознать')).toBeVisible()
      await checkAxe(page, 'S11 пусто')
      await page.goto('/#/add/paste')
      await page.getByLabel('Слова по одному на строке').fill('а\n'.repeat(501))
      await expect(page.getByRole('alert')).toContainText('Слишком длинный список: 501 строк')
      await checkAxe(page, 'S10 больше 500 строк')
      await page.goto('/#/add/word')
      await page.getByLabel('Армянское слово').fill('բարեv')
      await page.getByLabel('Транслитерация').fill('bar2')
      await page.getByLabel('Перевод примера').fill('x')
      await page.getByRole('button', { name: 'Сохранить' }).click()
      await expect(page.getByText('Как вы ввели:')).toBeVisible()
      await checkAxe(page, 'S12 все ошибки')
      await page.goto('/#/settings')
      await checkAxe(page, 'S07 заметка о хранении')
    })
  })
}

// --- Найденные баги (docs/qa/002-stage2-report.md) -------------------------------------------

test.describe('Баги этапа 2 (исправлены)', () => {
  test('BUG-1: длинное армянское слово (21 буква) помещается на карточке при 360px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await openWith(page, {
      userSets: [SET],
      userWords: [
        {
          id: 'u-1',
          setId: 's1',
          hy: 'անհամապատասխանություն',
          ru: 'несоответствие',
          createdAt: 1001,
        },
      ],
    })
    await page.goto('/#/session/set/s1')
    await expect(page.locator('.hy-hero')).toBeVisible()
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }))
    expect(m.sw).toBeLessThanOrEqual(m.iw)
  })

  test('BUG-2: название набора по умолчанию, которое не используется ни одной строкой, не блокирует сохранение', async ({
    page,
  }) => {
    await openWith(page, { userSets: [{ id: 's1', title: 'Набор от 19.10', createdAt: 1000 }] })
    await upload(page, 'b.csv', 'set;hy;ru\nУрок 5;բարև;привет\nУрок 5;հաց;хлеб\n')
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: 'Сохранить 2 слова' }).click()
    await expect(page.getByText('Сохранено: 2 слова в «Урок 5»')).toBeVisible({ timeout: 2000 })
  })

  test('BUG-3: испорченный процент-код в адресе не приводит к белому экрану', async ({ page }) => {
    await openWith(page, { userSets: [SET] })
    await page.goto('/')
    await page.evaluate(() => {
      location.hash = '/sets/%E0%A4%A'
    })
    await page.waitForTimeout(300)
    const len = await page.evaluate(() => document.getElementById('root')!.innerHTML.length)
    expect(len).toBeGreaterThan(0)
  })

  test('BUG-4: «Показаны первые N строк» склоняется (1 строка, 3 строки, 5 строк)', async ({
    page,
  }) => {
    await openWith(page)
    await upload(page, 'a.csv', 'hy;ru\nբարև;привет\nհաց;хлеб\n')
    await expect(page.getByText('Показаны первые 3 строки из 3')).toBeVisible({ timeout: 2000 })
  })

  test('BUG-5: длинное название набора без пробелов (30 знаков) не вызывает горизонтальную прокрутку при 320px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await openWith(page, {
      userSets: [{ id: 's1', title: 'Домашнее_задание_по_армянскому', createdAt: 1000 }],
    })
    await page.goto('/#/sets/s1')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }))
    expect(m.sw).toBeLessThanOrEqual(m.iw)
  })

  test('BUG-6: после добавления слова тост не заходит на кнопку «Сохранить» (S12)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await openWith(page, { userSets: [SET] })
    await page.goto('/#/add/word?set=s1')
    await page.getByLabel('Армянское слово').fill('բարև')
    await page.getByLabel('Перевод', { exact: true }).fill('привет')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByText('Слово добавлено')).toBeVisible()
    const overlap = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(
        (x) => x.textContent?.trim() === 'Сохранить',
      )!
      const t = document.querySelector('.toast')!.getBoundingClientRect()
      return Math.max(0, t.bottom - b.getBoundingClientRect().top)
    })
    expect(overlap).toBe(0)
  })

  test('BUG-7: подсказка «Будет: …» не показывается для армянского слова с недопустимыми символами', async ({
    page,
  }) => {
    await openWith(page)
    await page.goto('/#/add/word')
    await page.getByLabel('Армянское слово').fill('բարեv')
    await expect(page.getByText(/Будет: bare, авто/)).toHaveCount(0)
  })

  test('BUG-8: невидимый символ (ZWSP) в армянском слове не ломает разбор строки', async ({
    page,
  }) => {
    await openWith(page)
    await pasteAndParse(page, 'բար​և — привет')
    await expect(page.getByText('Распознано: 1')).toBeVisible({ timeout: 2000 })
  })

  test('ожидаемый баг (решение контролёра): ԵՎ при сравнении дубликатов равно և', async ({
    page,
  }) => {
    await openWith(page)
    await pasteAndParse(page, 'եւ — и\nԵՎ — и2')
    await expect(page.getByText('⚠ Повтор строки 1')).toBeVisible({ timeout: 2000 })
  })

  test('ожидаемый баг (решение контролёра): типографский апостроф ’ в транслитерации принимается', async ({
    page,
  }) => {
    await openWith(page)
    await pasteAndParse(page, 'թեյ — чай — t’ey')
    await expect(page.getByText('Распознано: 1')).toBeVisible({ timeout: 2000 })
  })
})

test.describe('Доработки этапа 2 (решения контролёра)', () => {
  test('S14: выбор разделителя CSV перечитывает файл и пересчитывает колонки', async ({ page }) => {
    await openWith(page)
    await upload(page, 'd.csv', 'հաց, նկանակ;хлеб, булка\nջուր, ըմպելիք;вода, напиток\n')
    await expect(page.getByLabel('Разделитель в файле')).toBeVisible()
    await expect(page.getByLabel('Роль колонки C')).toHaveCount(0)
    await page.getByLabel('Разделитель в файле').selectOption(',')
    await expect(page.getByLabel('Роль колонки C')).toBeVisible()
    await page.getByLabel('Разделитель в файле').selectOption('auto')
    await expect(page.getByLabel('Роль колонки C')).toHaveCount(0)
  })

  test('S14: непарная кавычка в CSV — ошибка с номером строки на S13', async ({ page }) => {
    await openWith(page)
    await upload(page, 'q.csv', 'hy;ru\nբարև;"привет\nհաց;хлеб\n')
    await expect(page.getByText('В строке 2 не закрыта кавычка')).toBeVisible({ timeout: 2000 })
  })

  test('S13: после неудачной загрузки нет кнопки «Продолжить с этим файлом»', async ({ page }) => {
    await openWith(page)
    await upload(page, 'a.csv', 'hy;ru\nբարև;привет\n')
    await page.goBack()
    await expect(page.getByRole('button', { name: 'Продолжить с этим файлом' })).toBeVisible()
    await upload(page, 'bad.xls', 'x')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Продолжить с этим файлом' })).toHaveCount(0)
  })

  test('S11: поле названия нового набора скрыто, если все строки с названием набора', async ({
    page,
  }) => {
    await openWith(page)
    await upload(page, 'b.csv', 'set;hy;ru\nУрок 5;բարև;привет\n')
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.getByLabel('Название нового набора')).toHaveCount(0)
  })
})

test('S14: выбранный разделитель сохраняется при возврате на экран', async ({ page }) => {
  await openWith(page)
  await upload(page, 'd.csv', 'հաց, նկանակ;хлеб, булка\nջուր, ըմպելիք;вода, напиток\n')
  await page.getByLabel('Разделитель в файле').selectOption(',')
  await page.getByRole('button', { name: 'Далее' }).click()
  await expect(page.getByText('Распознано')).toBeVisible()
  await page.getByRole('button', { name: 'Назад к колонкам' }).click()
  await expect(page.getByLabel('Разделитель в файле')).toHaveValue(',')
})
