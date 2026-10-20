import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { addDays, dump, dumpUser, know, openWith, TODAY } from './helpers.ts'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const SET_ID = 'set-lesson'

const LESSON_SET = { id: SET_ID, title: 'Урок 5', createdAt: 1000 }
const LESSON_WORDS = [
  { id: 'u-1', setId: SET_ID, hy: 'բարև', ru: 'привет', translit: 'barev', createdAt: 1001 },
  { id: 'u-2', setId: SET_ID, hy: 'հաց', ru: 'хлеб', createdAt: 1002 },
  {
    id: 'u-3',
    setId: SET_ID,
    hy: 'ջուր',
    ru: 'вода',
    translit: 'jur',
    translitAuto: false,
    createdAt: 1003,
  },
]

/** Главная → «Добавить слова» → выбранный способ. */
async function openMethod(page: Page, method: string) {
  await page.getByRole('link', { name: 'Добавить слова' }).first().click()
  await expect(page.getByRole('heading', { name: 'Как добавить?' })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(method) }).click()
}

async function pasteAndParse(page: Page, text: string) {
  await openMethod(page, 'Вставить список')
  await page.getByLabel('Слова по одному на строке').fill(text)
  await page.getByRole('button', { name: 'Разобрать' }).click()
  await expect(page.getByRole('heading', { name: 'Проверьте список' })).toBeVisible()
}

test.describe('Вставка списком → предпросмотр → сохранение → сессия (38–44, 58–66)', () => {
  test('пустое состояние «Мои наборы», способы добавления, заметка о хранении', async ({
    page,
  }) => {
    await openWith(page)
    await expect(page.getByRole('heading', { name: 'Мои наборы' })).toBeVisible()
    await expect(page.getByText('Добавьте слова, которые дал учитель')).toBeVisible()
    await page.getByRole('link', { name: 'Добавить слова' }).click()
    await expect(page.getByRole('heading', { name: 'Как добавить?' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Вставить список/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Добавить по одному/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Импорт из файла \(CSV, Excel\)/ })).toBeVisible()
    await expect(
      page.getByText('Свои слова хранятся только в этом браузере на этом устройстве.'),
    ).toBeVisible()
  })

  test('вставка → предпросмотр с ошибками и дубликатами → сохранение → экран набора → сессия', async ({
    page,
  }) => {
    await openWith(page)
    await openMethod(page, 'Вставить список')
    const parse = page.getByRole('button', { name: 'Разобрать' })
    await expect(parse).toBeDisabled()
    await expect(page.getByText('Вставьте список, чтобы продолжить')).toBeVisible()

    const text = [
      '1) բարև — привет',
      '2. հաց\tхлеб',
      '',
      '• կաթ – молоко',
      'ջուր; вода; jur',
      'shuka — рынок',
      'սուրճ кофе',
      'Բարև — здравствуй',
    ].join('\n')
    await page.getByLabel('Слова по одному на строке').fill(text)
    await parse.click()

    await expect(page.getByRole('heading', { name: 'Проверьте список' })).toBeVisible()
    await expect(page.getByText('Распознано: 5')).toBeVisible()
    await expect(page.getByText('с ошибками: 2, пустых строк пропущено: 1')).toBeVisible()
    // Набор по умолчанию: «Набор от ДД.ММ» (сегодня 19.10), наборов ещё нет — только поле названия.
    await expect(page.getByLabel('Название нового набора')).toHaveValue('Набор от 19.10')
    await expect(page.getByLabel('Сохранить в набор')).toHaveCount(0)

    const rows = page.locator('.pv-row')
    await expect(rows).toHaveCount(5)
    await expect(rows.nth(0)).toContainText('barev')
    await expect(rows.nth(0).getByRole('button', { name: 'авто' })).toBeVisible()
    await expect(rows.nth(3)).toContainText('jur')
    await expect(rows.nth(3).getByRole('button', { name: 'авто' })).toHaveCount(0)
    // Повтор из списка: не отмечен, ссылается на номер первой строки.
    await expect(rows.nth(4)).toContainText('⚠ Повтор строки 1')
    await expect(rows.nth(4).getByRole('checkbox')).not.toBeChecked()
    // Ошибочные строки: номер, исходный текст, причина.
    const errs = page.locator('.err-row')
    await expect(errs).toHaveCount(2)
    await expect(errs.nth(0)).toContainText('Строка 6')
    await expect(errs.nth(0)).toContainText('shuka — рынок')
    await expect(errs.nth(0)).toContainText('армянских букв нет ни в одной части')
    await expect(errs.nth(1)).toContainText('Строка 7')
    await expect(errs.nth(1)).toContainText('Не найден разделитель')

    // Метка «авто»: подсказка по нажатию.
    await rows.nth(0).getByRole('button', { name: 'авто' }).click()
    await expect(
      page.getByText('Транслитерация создана автоматически и может быть неточной.'),
    ).toBeVisible()

    await expect(page.getByRole('button', { name: 'Сохранить 4 слова' })).toBeEnabled()
    await rows.nth(1).getByRole('checkbox').uncheck()
    await expect(page.getByRole('button', { name: 'Сохранить 3 слова' })).toBeEnabled()
    await page.getByRole('button', { name: 'Снять отметки' }).click()
    const save0 = page.getByRole('button', { name: 'Сохранить 0 слов' })
    await expect(save0).toBeDisabled()
    await expect(page.getByText('Отметьте хотя бы одно слово')).toBeVisible()
    await page.getByRole('button', { name: 'Отметить все' }).click()
    await expect(page.getByRole('button', { name: 'Сохранить 5 слов' })).toBeEnabled()
    await rows.nth(4).getByRole('checkbox').uncheck()
    await page.getByRole('button', { name: 'Сохранить 4 слова' }).click()

    // Экран набора и тост.
    await expect(page.getByRole('heading', { name: 'Набор от 19.10' })).toBeVisible()
    await expect(page.getByText('Сохранено: 4 слова в «Набор от 19.10»')).toBeVisible()
    await expect(page.getByText('4 слова · выучено 0')).toBeVisible()
    const words = page.locator('.word-row')
    await expect(words).toHaveCount(4)
    await expect(words.nth(0)).toContainText('բարև')
    await expect(words.nth(0)).toContainText('новое')
    await expect(words.nth(0)).toContainText('авто')
    await expect(words.nth(3)).toContainText('jur')

    const saved = await dumpUser(page)
    expect(saved.sets).toHaveLength(1)
    expect(saved.words.map((w) => w.hy)).toEqual(['բարև', 'հաց', 'կաթ', 'ջուր'])
    expect(saved.words.every((w) => String(w.id).startsWith('u-'))).toBe(true)
    expect(saved.words.map((w) => w.translitAuto)).toEqual([true, true, true, false])

    // Сессия по набору: новые слова в порядке добавления.
    await page.getByRole('link', { name: 'Учить', exact: true }).click()
    await expect(page.locator('.hy-hero')).toHaveText('բարև')
    await expect(page.locator('.translit')).toContainText('barev')
    await know(page)
    await expect(page.locator('.hy-hero')).toHaveText('հաց')
    const p = await dump(page, 'progress')
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ box: 2, dueDate: addDays(TODAY, 2) })

    // Данные переживают перезагрузку; главная показывает набор с прогрессом.
    await page.goto('/#/')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Мои наборы' })).toBeVisible()
    const set = page.locator('.set-row', { hasText: 'Набор от 19.10' })
    await expect(set).toContainText('выучено 0 из 4')
    await expect(page.locator('.stat', { hasText: 'Выучено' }).first()).toContainText('из 92')
  })

  test('0 распознанных строк: подсказка формата, сохранить недоступно; «Исправить текст» не теряет текст', async ({
    page,
  }) => {
    await openWith(page)
    await pasteAndParse(page, 'просто текст\nещё текст')
    await expect(
      page.getByText('Ни одной строки не удалось распознать. Проверьте формат: «բարև — привет»'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /Сохранить 0 слов/ })).toBeDisabled()
    await expect(page.locator('.err-row')).toHaveCount(2)
    await page.getByRole('button', { name: 'Исправить текст' }).click()
    await expect(page.getByLabel('Слова по одному на строке')).toHaveValue(
      'просто текст\nещё текст',
    )
  })

  test('больше 500 строк: ошибка до разбора', async ({ page }) => {
    await openWith(page)
    await openMethod(page, 'Вставить список')
    const many = Array.from({ length: 501 }, (_, i) => `ա${i} — слово`).join('\n')
    await page.getByLabel('Слова по одному на строке').fill(many)
    await expect(
      page.getByText('Слишком длинный список: 501 строк, максимум 500. Разделите его на части.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Разобрать' })).toBeDisabled()
  })

  test('сохранение в существующий набор: дубликаты «Уже есть в наборе»', async ({ page }) => {
    await openWith(page, { userSets: [LESSON_SET], userWords: LESSON_WORDS })
    await page
      .getByRole('link', { name: /Урок 5/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Добавить слова' }).click()
    await page.getByRole('link', { name: /Вставить список/ }).click()
    await page.getByLabel('Слова по одному на строке').fill('բարև — привет\nկաթ — молоко')
    await page.getByRole('button', { name: 'Разобрать' }).click()
    // Набор выбран тот, из которого открыто добавление.
    await expect(page.getByLabel('Сохранить в набор')).toHaveValue(SET_ID)
    const rows = page.locator('.pv-row')
    await expect(rows.nth(0)).toContainText('⚠ Уже есть в наборе')
    await expect(rows.nth(0).getByRole('checkbox')).not.toBeChecked()
    await expect(rows.nth(1).getByRole('checkbox')).toBeChecked()
    // Если выбрать «Новый набор…», слово больше не дубликат.
    await page.getByLabel('Сохранить в набор').selectOption({ label: 'Новый набор…' })
    await expect(rows.nth(0)).not.toContainText('Уже есть в наборе')
    await page.getByLabel('Сохранить в набор').selectOption(SET_ID)
    await page.getByRole('button', { name: 'Сохранить 1 слово' }).click()
    await expect(page.getByText('Сохранено: 1 слово в «Урок 5»')).toBeVisible()
    await expect(page.locator('.word-row')).toHaveCount(4)
  })

  test('название нового набора: пусто, дубликат без учёта регистра, слишком длинно', async ({
    page,
  }) => {
    await openWith(page, { userSets: [LESSON_SET], userWords: LESSON_WORDS })
    await pasteAndParse(page, 'կաթ — молоко')
    await page.getByLabel('Сохранить в набор').selectOption({ label: 'Новый набор…' })
    const title = page.getByLabel('Название нового набора')
    const save = page.getByRole('button', { name: 'Сохранить 1 слово' })
    await title.fill('  ')
    await save.click()
    await expect(page.getByText('Введите название набора')).toBeVisible()
    await title.fill('УРОК 5')
    await save.click()
    await expect(page.getByText('Набор с таким названием уже есть')).toBeVisible()
    await title.fill('я'.repeat(51))
    await save.click()
    await expect(page.getByText('Слишком длинно: максимум 50 символов')).toBeVisible()
    await title.fill('Урок 6')
    await save.click()
    await expect(page.getByRole('heading', { name: 'Урок 6' })).toBeVisible()
  })
})

test.describe('Импорт CSV / XLSX с сопоставлением колонок (71–79, 101–103)', () => {
  test('CSV (UTF-8 BOM, «;», русские заголовки): колонки определены, лишняя колонка не импортируется', async ({
    page,
  }) => {
    await openWith(page)
    await openMethod(page, 'Импорт из файла')
    await expect(page.getByText('Подходят файлы .csv и .xlsx, до 5 МБ и 3000 строк')).toBeVisible()
    await expect(
      page.getByText('Файл, который вы выгрузили из Hayeren, загружается без настройки.'),
    ).toBeVisible()
    await page.locator('input[type=file]').setInputFiles(fixture('lesson-semicolon.csv'))

    await expect(page.getByRole('heading', { name: 'Что в колонках' })).toBeVisible()
    await expect(page.getByText('Колонки определены по заголовкам.')).toBeVisible()
    await expect(page.getByLabel('Первая строка — заголовки')).toBeChecked()
    await expect(page.getByLabel('Роль колонки A')).toHaveValue('hy')
    await expect(page.getByLabel('Роль колонки B')).toHaveValue('ru')
    await expect(page.getByLabel('Роль колонки C')).toHaveValue('translit')
    await expect(page.getByLabel('Роль колонки D')).toHaveValue('skip')
    await expect(page.getByText('Показаны первые 5 строк из 6.')).toBeVisible()

    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.getByRole('heading', { name: 'Проверьте список' })).toBeVisible()
    await expect(page.getByText('Распознано: 5')).toBeVisible()
    const rows = page.locator('.pv-row')
    await expect(rows).toHaveCount(5)
    await expect(rows.nth(2)).toContainText('լավ, բարի')
    await expect(rows.nth(2)).toContainText('lav bari')
    await expect(rows.nth(2).getByRole('button', { name: 'авто' })).toHaveCount(0)
    await expect(rows.nth(0).getByRole('button', { name: 'авто' })).toBeVisible()
    await page.getByRole('button', { name: 'Сохранить 5 слов' }).click()
    await expect(page.locator('.word-row')).toHaveCount(5)
    await expect(page.getByText(/Сохранено: 5 слов в «Набор от \d\d\.\d\d»/)).toBeVisible()
  })

  test('CSV с табуляцией без заголовков: колонки по содержимому, номера строк как в файле', async ({
    page,
  }) => {
    await openWith(page)
    await openMethod(page, 'Импорт из файла')
    await page.locator('input[type=file]').setInputFiles(fixture('lesson-tab-noheader.csv'))
    await expect(
      page.getByText('Заголовков не нашли, колонки определены по содержимому.'),
    ).toBeVisible()
    await expect(page.getByLabel('Первая строка — заголовки')).not.toBeChecked()
    await expect(page.getByLabel('Роль колонки A')).toHaveValue('skip')
    await expect(page.getByLabel('Роль колонки B')).toHaveValue('hy')
    await expect(page.getByLabel('Роль колонки C')).toHaveValue('ru')
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(
      page.getByText('Распознано: 3, с ошибками: 1, пустых строк пропущено: 1'),
    ).toBeVisible()
    const err = page.locator('.err-row')
    await expect(err).toContainText('Строка 4')
    await expect(err).toContainText('Нет перевода')
  })

  test('XLSX: первый лист, уведомление о втором листе, число и формула', async ({ page }) => {
    await openWith(page)
    await openMethod(page, 'Импорт из файла')
    await page.locator('input[type=file]').setInputFiles(fixture('lesson.xlsx'))
    await expect(page.getByText('Импортирован первый лист «Урок 7»')).toBeVisible()
    await expect(page.getByLabel('Роль колонки A')).toHaveValue('hy')
    await expect(page.getByLabel('Роль колонки D')).toHaveValue('exampleHy')
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.getByText('Распознано: 4')).toBeVisible()
    const rows = page.locator('.pv-row')
    await expect(rows.nth(2)).toContainText('2')
    await expect(rows.nth(3)).toContainText('десять')
    await expect(rows.nth(0)).toContainText('Բարի առավոտ, Արամ։')
    await page.getByLabel('Название нового набора').fill('Урок 7')
    await page.getByRole('button', { name: 'Сохранить 4 слова' }).click()
    await expect(page.getByRole('heading', { name: 'Урок 7' })).toBeVisible()
    const saved = await dumpUser(page)
    expect(saved.words.map((w) => w.ru)).toEqual(['доброе утро', 'ночь', '2', 'десять'])
    expect(saved.words[0].exampleHy).toBe('Բարի առավոտ, Արամ։')
  })

  test('сопоставление: обязательные роли, повторы ролей, «Набор» необязателен', async ({
    page,
  }) => {
    await openWith(page)
    await openMethod(page, 'Импорт из файла')
    await page.locator('input[type=file]').setInputFiles(fixture('lesson-semicolon.csv'))
    const next = page.getByRole('button', { name: 'Далее' })
    await expect(next).toBeEnabled()

    await page.getByLabel('Роль колонки B').selectOption('skip')
    await expect(next).toBeDisabled()
    await expect(page.getByText('Выберите колонку для «Перевод»')).toBeVisible()

    await page.getByLabel('Роль колонки B').selectOption('ru')
    await page.getByLabel('Роль колонки D').selectOption('translit')
    await expect(next).toBeDisabled()
    await expect(
      page.getByText('Роль «Транслитерация» назначена нескольким колонкам — оставьте одну'),
    ).toBeVisible()

    await page.getByLabel('Роль колонки D').selectOption('set')
    await expect(next).toBeEnabled()
    // Колонка «Набор» назначена колонке с заметками: «приветствие» станет названием набора.
    await next.click()
    await expect(page.getByText(/Новых наборов: 2/)).toBeVisible()
    await expect(page.getByLabel('Набор для строк без названия набора')).toHaveCount(0)
    await expect(page.getByLabel('Название нового набора')).toBeVisible()
    await expect(page.locator('.pv-row').first()).toContainText('приветствие · новый набор')

    // «Назад к колонкам» не теряет выбор.
    await page.getByRole('button', { name: 'Назад к колонкам' }).click()
    await expect(page.getByLabel('Роль колонки D')).toHaveValue('set')
  })

  test('ошибки файла: .xls, не UTF-8, больше 5 МБ, больше 3000 строк, повреждённый xlsx', async ({
    page,
  }) => {
    await openWith(page)
    await openMethod(page, 'Импорт из файла')
    const input = page.locator('input[type=file]')
    const alert = page.getByRole('alert')

    await input.setInputFiles(fixture('old-format.xls'))
    await expect(alert).toHaveText(
      /Поддерживаются файлы CSV и Excel \(\.xlsx\)\. Старый формат \.xls пересохраните в Excel как \.xlsx\./,
    )
    await input.setInputFiles(fixture('cp1251.csv'))
    await expect(alert).toContainText('Файл не в кодировке UTF-8')
    await input.setInputFiles({
      name: 'big.csv',
      mimeType: 'text/csv',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 'a'),
    })
    await expect(alert).toContainText('Файл больше 5 МБ')
    const rows3001 = 'hy;ru\n' + Array.from({ length: 3001 }, (_, i) => `ա${i};вода`).join('\n')
    await input.setInputFiles({
      name: 'long.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(rows3001),
    })
    await expect(alert).toContainText('В файле 3001 строк, максимум 3000. Разделите файл на части.')
    await input.setInputFiles({
      name: 'broken.xlsx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('не zip'),
    })
    await expect(alert).toContainText(
      'Не удалось открыть файл. Проверьте, что он не защищён паролем',
    )
    // Остались на экране выбора файла.
    await expect(page.getByRole('heading', { name: 'Импорт из файла' })).toBeVisible()
  })

  test('файл формата будущего экспорта: колонки сами, наборы по колонке «Набор», порядок и значения сохраняются', async ({
    page,
  }) => {
    await openWith(page)
    await openMethod(page, 'Импорт из файла')
    await page.locator('input[type=file]').setInputFiles(fixture('backup-format.csv'))
    await expect(page.getByText('Колонки определены по заголовкам.')).toBeVisible()
    await expect(page.getByLabel('Первая строка — заголовки')).toBeChecked()
    await expect(page.getByLabel('Роль колонки A')).toHaveValue('set')
    await page.getByRole('button', { name: 'Далее' }).click()

    await expect(page.getByText('Распознано: 5')).toBeVisible()
    await expect(page.getByText('Новых наборов: 2')).toBeVisible()
    await expect(page.getByText('Набор для строк без названия набора')).toHaveCount(0)
    await page.getByRole('button', { name: 'Сохранить 5 слов' }).click()

    // Несколько наборов: переход на главную, новые сверху = в порядке файла старый → новый.
    await expect(page.getByText('Сохранено: 5 слов, 2 набора')).toBeVisible()
    const names = await page.locator('.set-row .name').allTextContents()
    expect(names).toEqual(['Кухня и еда', 'Урок 5'])
    const saved = await dumpUser(page)
    const lesson = saved.sets.find((s) => s.title === 'Урок 5')!
    const words = saved.words.filter((w) => w.setId === lesson.id)
    expect(words.map((w) => w.hy)).toEqual(['բարև', 'տուն', 'եւ'])
    expect(words[1]).toMatchObject({
      ru: 'дом, жильё; ещё "дом"',
      translit: 'tun',
      translitAuto: false,
      exampleHy: 'Տունը մեծ է։',
      exampleRu: 'Дом большой.',
    })
    expect(words[2]).toMatchObject({ ru: '-ый суффикс', hy: 'եւ' })
    expect(words[0].translitAuto).toBe(true)

    // Повторная загрузка того же файла: все строки «Уже есть в наборе» и не отмечены.
    await openMethod(page, 'Импорт из файла')
    await page.locator('input[type=file]').setInputFiles(fixture('backup-format.csv'))
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(
      page.getByText('Эти слова уже есть в приложении, поэтому они не отмечены.'),
    ).toBeVisible()
    await expect(page.getByText('Новых наборов: 0')).toBeVisible()
    await expect(page.locator('.pv-row .chip-warn')).toHaveCount(5)
    await expect(page.locator('.pv-row input:checked')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Сохранить 0 слов' })).toBeDisabled()
  })

  test('лимит 3000 слов: ничего не сохраняется, предпросмотр остаётся', async ({ page }) => {
    await openWith(page)
    await openMethod(page, 'Импорт из файла')
    const csv =
      'hy;ru\n' +
      Array.from({ length: 3000 }, (_, i) => `ա${'բ'.repeat(i % 5)}${i};вода ${i}`).join('\n')
    await page.locator('input[type=file]').setInputFiles({
      name: 'max.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    })
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.getByText('Распознано: 3000')).toBeVisible()
    // Строки подгружаются порциями по 100.
    await expect(page.locator('.pv-row')).toHaveCount(100)
    await page.getByRole('button', { name: 'Показать ещё 100' }).click()
    await expect(page.locator('.pv-row')).toHaveCount(200)
    await page.getByRole('button', { name: 'Сохранить 3000 слов' }).click()
    await expect(page.getByRole('heading', { name: /Набор от/ })).toBeVisible()

    // Ещё одно слово сверх лимита.
    await page.goto('/#/add/paste')
    await page.getByLabel('Слова по одному на строке').fill('շուկա — рынок')
    await page.getByRole('button', { name: 'Разобрать' }).click()
    await page.getByLabel('Сохранить в набор').selectOption({ label: 'Новый набор…' })
    await page.getByLabel('Название нового набора').fill('Ещё')
    await page.getByRole('button', { name: 'Сохранить 1 слово' }).click()
    await expect(
      page.getByText('Можно хранить не больше 3000 своих слов. Сейчас: 3000, добавляете: 1.'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Проверьте список' })).toBeVisible()
    const saved = await dumpUser(page)
    expect(saved.words).toHaveLength(3000)
    expect(saved.sets).toHaveLength(1)
  })
})

test.describe('Форма по одному (45–51, 55–56, 67–70)', () => {
  test('ошибки валидации под полями, фокус на первом, данные не теряются', async ({ page }) => {
    await openWith(page)
    await openMethod(page, 'Добавить по одному')
    await expect(page.getByRole('heading', { name: 'Добавить слово' })).toBeVisible()
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(
      page.getByText('Здесь нужно слово армянскими буквами, например բարև.'),
    ).toBeVisible()
    await expect(page.getByText('Введите перевод')).toBeVisible()
    await expect(page.getByLabel('Армянское слово')).toBeFocused()
    await expect(page.getByLabel('Армянское слово')).toHaveAttribute('aria-invalid', 'true')

    // Смесь раскладок: список символов и подсветка.
    await page.getByLabel('Армянское слово').fill('կաfe')
    await page.getByLabel('Перевод', { exact: true }).fill('кафе')
    await page.getByLabel(/Транслитерация/).fill('բարև')
    await page.getByLabel('Перевод примера').fill('Привет')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(
      page.getByText('В армянском слове есть латинские или русские буквы: f, e.'),
    ).toBeVisible()
    await expect(page.locator('.bad-char')).toHaveText(['f', 'e'])
    await expect(page.getByText('В транслитерации есть недопустимые символы')).toBeVisible()
    await expect(page.getByText('Сначала заполните пример на армянском')).toBeVisible()
    await expect(page.getByLabel('Армянское слово')).toBeFocused()
    // Введённое не потеряно.
    await expect(page.getByLabel('Перевод', { exact: true })).toHaveValue('кафе')
    await expect(page.getByLabel(/Транслитерация/)).toHaveValue('բարև')

    // Слишком длинно.
    await page.getByLabel('Армянское слово').fill('ա'.repeat(61))
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByText('Слишком длинно: максимум 60 символов')).toBeVisible()
    expect((await dumpUser(page)).words).toHaveLength(0)
  })

  test('подсказка «будет: …, авто», сохранение, очистка формы, фокус в первом поле, «Готово»', async ({
    page,
  }) => {
    await openWith(page)
    await openMethod(page, 'Добавить по одному')
    await expect(page.getByText('Оставьте пустым — создадим автоматически')).toBeVisible()
    await page.getByLabel('Армянское слово').fill('բարև')
    await expect(page.getByText('Будет: barev, авто')).toBeVisible()
    await page.getByLabel('Перевод', { exact: true }).fill('привет')
    await page.getByLabel('Название нового набора').fill('Урок 1')
    await page.getByRole('button', { name: 'Сохранить' }).click()

    await expect(page.getByText('Слово добавлено в «Урок 1»')).toBeVisible()
    await expect(page.getByLabel('Армянское слово')).toHaveValue('')
    await expect(page.getByLabel('Армянское слово')).toBeFocused()
    // Набор остаётся выбранным (теперь существующий).
    await expect(page.getByLabel('Набор')).toHaveText(/Урок 1/)

    // Второе слово с ручной транслитерацией и примером.
    await page.getByLabel('Армянское слово').fill('ջուր')
    await page.getByLabel('Перевод', { exact: true }).fill('вода')
    await page.getByLabel(/Транслитерация/).fill('jur')
    await page.getByLabel('Пример (по-армянски)').fill('Ջուր տվեք։')
    await page.getByLabel('Перевод примера').fill('Дайте воды.')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByText('Слово добавлено в «Урок 1»')).toBeVisible()

    await page.getByRole('button', { name: 'Готово' }).click()
    await expect(page.getByRole('heading', { name: 'Урок 1' })).toBeVisible()
    await expect(page.locator('.word-row')).toHaveCount(2)
    const saved = await dumpUser(page)
    expect(saved.words[0]).toMatchObject({ hy: 'բարև', translit: 'barev', translitAuto: true })
    expect(saved.words[1]).toMatchObject({
      hy: 'ջուր',
      translit: 'jur',
      translitAuto: false,
      exampleHy: 'Ջուր տվեք։',
      exampleRu: 'Дайте воды.',
    })
  })

  test('дубликат в наборе: предупреждение, «Отмена» возвращает в форму, «Всё равно добавить» добавляет', async ({
    page,
  }) => {
    await openWith(page, { userSets: [LESSON_SET], userWords: LESSON_WORDS })
    await page.goto(`/#/add/word?set=${SET_ID}`)
    await page.getByLabel('Армянское слово').fill('Բարև')
    await page.getByLabel('Перевод', { exact: true }).fill('здравствуйте')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Это слово уже есть в наборе «Урок 5»')
    await dialog.getByRole('button', { name: 'Отмена' }).click()
    await expect(page.getByLabel('Перевод', { exact: true })).toHaveValue('здравствуйте')
    await expect(page.getByLabel('Армянское слово')).toBeFocused()
    expect((await dumpUser(page)).words).toHaveLength(3)

    await page.getByRole('button', { name: 'Сохранить' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Всё равно добавить' }).click()
    await expect(page.getByText('Слово добавлено в «Урок 5»')).toBeVisible()
    expect((await dumpUser(page)).words).toHaveLength(4)
  })
})

test.describe('Редактирование и удаление (41, 80–83)', () => {
  const progress = [
    { wordId: 'u-1', box: 3, dueDate: addDays(TODAY, 4) },
    { wordId: 'u-2', box: 5, dueDate: addDays(TODAY, 16) },
  ]

  test('экран набора: сводка, статусы, встроенные слова без действий изменения', async ({
    page,
  }) => {
    await openWith(page, { userSets: [LESSON_SET], userWords: LESSON_WORDS, progress })
    await page
      .getByRole('link', { name: /Урок 5/ })
      .first()
      .click()
    await expect(page.getByText('3 слова · выучено 1')).toBeVisible()
    const rows = page.locator('.word-row')
    await expect(rows.nth(0)).toContainText('учу')
    await expect(rows.nth(1)).toContainText('выучено')
    await expect(rows.nth(2)).toContainText('новое')
    await expect(page.getByRole('button', { name: 'Переименовать' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Удалить набор' })).toBeVisible()
    // У встроенных тем нет такого экрана и действий изменения.
    await page.goto('/#/sets/greetings')
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    await page.goto('/#/sets/greetings/words/greetings-01')
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
  })

  test('изменение слова: прогресс не меняется, авто-транслитерация пересчитывается, ручная нет', async ({
    page,
  }) => {
    await openWith(page, { userSets: [LESSON_SET], userWords: LESSON_WORDS, progress })
    await page.goto(`/#/sets/${SET_ID}`)
    await page.locator('.word-row', { hasText: 'հաց' }).click()
    await expect(page.getByRole('heading', { name: 'Изменить слово' })).toBeVisible()
    await expect(page.getByLabel('Армянское слово')).toHaveValue('հաց')
    // У слова с авто-транслитерацией поле пустое, а вычисленная показана подсказкой.
    await expect(page.getByLabel(/Транслитерация/)).toHaveValue('')
    await expect(page.getByText("Будет: hats', авто")).toBeVisible()
    await expect(page.getByText('Урок 5', { exact: true })).toBeVisible()
    await page.getByLabel('Армянское слово').fill('կաթ')
    await page.getByLabel('Перевод', { exact: true }).fill('молоко')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByText('Изменения сохранены')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Урок 5' })).toBeVisible()

    let saved = await dumpUser(page)
    expect(saved.words.find((w) => w.id === 'u-2')).toMatchObject({
      hy: 'կաթ',
      ru: 'молоко',
      translit: "kat'",
      translitAuto: true,
    })
    // SRS-состояние не изменилось.
    const p2 = (await dump(page, 'progress')).find((r) => r.wordId === 'u-2')
    expect(p2).toMatchObject({ box: 5, dueDate: addDays(TODAY, 16) })

    // Ручная транслитерация при смене hy не меняется.
    await page.locator('.word-row', { hasText: 'ջուր' }).click()
    await expect(page.getByLabel(/Транслитерация/)).toHaveValue('jur')
    await page.getByLabel('Армянское слово').fill('ջրհոր')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByText('Изменения сохранены')).toBeVisible()
    saved = await dumpUser(page)
    expect(saved.words.find((w) => w.id === 'u-3')).toMatchObject({
      hy: 'ջրհոր',
      translit: 'jur',
      translitAuto: false,
    })

    // Ручная правка авто-слова: метка «авто» исчезает.
    await page.locator('.word-row', { hasText: 'կաթ' }).click()
    await page.getByLabel(/Транслитерация/).fill('kat')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.locator('.word-row', { hasText: 'կաթ' })).not.toContainText('авто')
  })

  test('ошибки валидации при изменении; «Отмена» ничего не меняет', async ({ page }) => {
    await openWith(page, { userSets: [LESSON_SET], userWords: LESSON_WORDS })
    await page.goto(`/#/sets/${SET_ID}/words/u-1`)
    await page.getByLabel('Перевод', { exact: true }).fill('')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByText('Введите перевод')).toBeVisible()
    await expect(page.getByLabel('Перевод', { exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Отмена' }).click()
    expect((await dumpUser(page)).words.find((w) => w.id === 'u-1')).toMatchObject({ ru: 'привет' })
  })

  test('удаление слова: подтверждение, состояние SRS удаляется, слово исчезает из сессии и счётчиков', async ({
    page,
  }) => {
    await openWith(page, {
      userSets: [LESSON_SET],
      userWords: LESSON_WORDS,
      progress: [{ wordId: 'u-1', box: 2, dueDate: addDays(TODAY, -1) }],
    })
    await expect(page.getByRole('button', { name: 'Повторить (1)' })).toBeEnabled()
    await page.goto(`/#/sets/${SET_ID}/words/u-1`)
    await page.getByRole('button', { name: 'Удалить слово' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Удалить слово «բարև»?')
    await expect(dialog).toContainText('Прогресс по слову тоже будет удалён.')
    await dialog.getByRole('button', { name: 'Отмена' }).click()
    expect((await dumpUser(page)).words).toHaveLength(3)

    await page.getByRole('button', { name: 'Удалить слово' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click()
    await expect(page.getByText('Слово удалено')).toBeVisible()
    await expect(page.getByText('2 слова · выучено 0')).toBeVisible()
    const saved = await dumpUser(page)
    expect(saved.words.map((w) => w.id)).toEqual(['u-2', 'u-3'])
    expect(saved.progress.find((p) => p.wordId === 'u-1')).toBeUndefined()
    // Мягкое удаление: запись остаётся как «надгробие» для будущей синхронизации.
    expect(saved.allWords.find((w) => w.id === 'u-1')).toMatchObject({
      deletedAt: expect.any(Number),
    })

    await page.getByRole('button', { name: 'Назад' }).click()
    await expect(page.getByRole('button', { name: 'Повторить (0)' })).toBeDisabled()
    await expect(page.locator('.stat', { hasText: 'Выучено' }).first()).toContainText('из 90')
  })

  test('переименование набора: ошибки, успех, без изменений — без тоста', async ({ page }) => {
    await openWith(page, {
      userSets: [LESSON_SET, { id: 'set-2', title: 'Кухня', createdAt: 2000 }],
      userWords: LESSON_WORDS,
    })
    await page.goto(`/#/sets/${SET_ID}`)
    await page.getByRole('button', { name: 'Переименовать' }).click()
    const dialog = page.getByRole('dialog')
    const input = dialog.getByLabel('Название')
    await expect(input).toHaveValue('Урок 5')
    await input.fill('кухня')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await expect(dialog.getByText('Набор с таким названием уже есть')).toBeVisible()
    await input.fill('   ')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await expect(dialog.getByText('Введите название набора')).toBeVisible()
    await input.fill('я'.repeat(51))
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await expect(dialog.getByText('Слишком длинно: максимум 50 символов')).toBeVisible()
    // Свой собственный текущий вариант (другой регистр) допустим.
    await input.fill('УРОК 5')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByText('Набор переименован')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'УРОК 5' })).toBeVisible()
    // Esc закрывает диалог без изменений.
    await page.getByRole('button', { name: 'Переименовать' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await dumpUser(page)).sets.map((s) => s.title).sort()).toEqual(['Кухня', 'УРОК 5'])
  })

  test('удаление набора: подтверждение с числом слов, слова и состояния удаляются', async ({
    page,
  }) => {
    await openWith(page, {
      userSets: [LESSON_SET],
      userWords: LESSON_WORDS,
      progress: [{ wordId: 'u-1', box: 2, dueDate: addDays(TODAY, -1) }],
    })
    await page.goto(`/#/sets/${SET_ID}`)
    await page.getByRole('button', { name: 'Удалить набор' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(
      'Удалить набор «Урок 5» и 3 слова? Прогресс по ним будет потерян.',
    )
    await dialog.getByRole('button', { name: 'Отмена' }).click()
    expect((await dumpUser(page)).sets).toHaveLength(1)

    await page.getByRole('button', { name: 'Удалить набор' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click()
    await expect(page.getByText('Набор удалён')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
    await expect(page.getByText('Добавьте слова, которые дал учитель')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Повторить (0)' })).toBeDisabled()
    await expect(page.locator('.stat', { hasText: 'Выучено' }).first()).toContainText('из 88')
    const saved = await dumpUser(page)
    expect(saved.sets).toHaveLength(0)
    expect(saved.words).toHaveLength(0)
    expect(saved.progress).toHaveLength(0)
  })

  test('пустой набор остаётся в списке: «0 слов», без «Учить», с «Добавить слова»', async ({
    page,
  }) => {
    await openWith(page, { userSets: [LESSON_SET] })
    const row = page.locator('.set-row', { hasText: 'Урок 5' })
    await expect(row).toContainText('0 слов')
    await expect(row.getByRole('link', { name: /Учить/ })).toHaveCount(0)
    await row.getByRole('link', { name: /Урок 5/ }).click()
    await expect(page.getByText('В наборе пока нет слов')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Учить', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Добавить слова' })).toBeVisible()
  })
})

test.describe('Свои слова наравне со встроенными (42, 111–112)', () => {
  test('«Повторить (N)» и плитки считают свои слова; сессия по набору берёт просроченные из всех мест', async ({
    page,
  }) => {
    await openWith(page, {
      userSets: [LESSON_SET],
      userWords: LESSON_WORDS,
      progress: [
        { wordId: 'u-1', box: 2, dueDate: addDays(TODAY, -3) },
        { wordId: 'greetings-01', box: 2, dueDate: addDays(TODAY, -1) },
        { wordId: 'u-2', box: 4, dueDate: addDays(TODAY, 8) },
      ],
    })
    await expect(page.getByRole('button', { name: 'Повторить (2)' })).toBeEnabled()
    await expect(page.locator('.stat', { hasText: 'Повторить сегодня' })).toContainText('2')
    await expect(page.locator('.stat', { hasText: 'Выучено' }).first()).toContainText('1')
    await expect(page.locator('.set-row')).toContainText('выучено 1 из 3')
    await page.getByRole('button', { name: 'Повторить (2)' }).click()
    // Самое просроченное первым: свое слово u-1 (−3 дня).
    await expect(page.locator('.hy-hero')).toHaveText('բարև')
    await know(page)
    await expect(page.locator('.hy-hero')).toHaveText('բարև')
    const after = (await dump(page, 'progress')).find((r) => r.wordId === 'u-1')
    expect(after).toMatchObject({ box: 3, dueDate: addDays(TODAY, 4) })
  })
})
