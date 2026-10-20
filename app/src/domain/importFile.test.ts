import { describe, expect, it } from 'vitest'
import { decodeUtf8, parseCsvAuto } from './csv'
import {
  applyMapping,
  dataRowCount,
  detectMapping,
  mappingProblems,
  tooManyRowsMessage,
  unprotectFormula,
  type Role,
} from './importFile'

describe('75: автоопределение колонок по заголовкам', () => {
  it('русские заголовки и регистр', () => {
    const m = detectMapping([
      [' Слово ', 'ПЕРЕВОД', 'Произношение', 'Заметки'],
      ['բարև', 'привет', 'barev', ''],
    ])
    expect(m).toEqual({
      hasHeader: true,
      detectedBy: 'headers',
      roles: ['hy', 'ru', 'translit', 'skip'],
    })
  })

  it('формат экспорта: set;hy;ru;translit;example_hy;example_ru', () => {
    const m = detectMapping([['set', 'hy', 'ru', 'translit', 'example_hy', 'example_ru']])
    expect(m.roles).toEqual(['set', 'hy', 'ru', 'translit', 'exampleHy', 'exampleRu'])
    expect(m.hasHeader).toBe(true)
    expect(detectMapping([['Набор', 'Армянский', 'Русский']]).roles).toEqual(['set', 'hy', 'ru'])
  })

  it('все названия из таблицы критерия 75', () => {
    const names: [string, Role][] = [
      ['armenian', 'hy'],
      ['հայերեն', 'hy'],
      ['բառ', 'hy'],
      ['по-армянски', 'hy'],
      ['translation', 'ru'],
      ['russian', 'ru'],
      ['по-русски', 'ru'],
      ['transliteration', 'translit'],
      ['пример', 'exampleHy'],
      ['перевод примера', 'exampleRu'],
    ]
    for (const [name, role] of names) {
      expect(detectMapping([[name]]).roles[0]).toBe(role)
    }
  })

  it('повтор роли остаётся у первой колонки', () => {
    expect(detectMapping([['hy', 'слово', 'ru']]).roles).toEqual(['hy', 'skip', 'ru'])
  })
})

describe('75: без заголовков — по содержимому', () => {
  it('армянское слово — первая колонка, где армянские буквы не менее чем в половине ячеек', () => {
    const m = detectMapping([
      ['1', 'բարև', 'привет', 'barev'],
      ['2', 'հաց', 'хлеб', 'hats'],
    ])
    expect(m).toEqual({
      hasHeader: false,
      detectedBy: 'content',
      roles: ['skip', 'hy', 'ru', 'skip'],
    })
  })

  it('порядок «перевод, слово» тоже опознаётся', () => {
    expect(
      detectMapping([
        ['привет', 'բարև'],
        ['хлеб', 'հաց'],
      ]).roles,
    ).toEqual(['ru', 'hy'])
  })

  it('ровно половина армянских ячеек — ещё армянская колонка', () => {
    const m = detectMapping([['բարև'], ['hello']])
    expect(m.roles).toEqual(['hy'])
  })

  it('нет подходящих колонок — всё «Не импортировать»', () => {
    expect(detectMapping([['', '']]).roles).toEqual(['skip', 'skip'])
  })
})

describe('76: проверка сопоставления', () => {
  it('обязательны слово и перевод, роли не повторяются', () => {
    expect(mappingProblems(['hy', 'ru', 'skip'])).toEqual([])
    expect(mappingProblems(['skip', 'ru'])).toEqual(['Выберите колонку для «Армянское слово»'])
    expect(mappingProblems(['hy', 'skip'])).toEqual(['Выберите колонку для «Перевод»'])
    expect(mappingProblems(['hy', 'ru', 'translit', 'translit'])).toEqual([
      'Роль «Транслитерация» назначена нескольким колонкам — оставьте одну',
    ])
    expect(mappingProblems(['hy', 'ru', 'skip', 'skip', 'set'])).toEqual([])
    expect(mappingProblems(['hy', 'ru', 'set', 'set'])).toEqual([
      'Роль «Набор» назначена нескольким колонкам — оставьте одну',
    ])
  })
})

describe('77–78: применение сопоставления', () => {
  const roles: Role[] = ['hy', 'ru', 'translit']

  it('номера строк — как в файле, с учётом заголовка; пустые строки пропускаются', () => {
    const rows = [
      ['hy', 'ru', 'translit'],
      ['բարև', 'привет', ''],
      ['', '', ''],
      ['', 'хлеб', ''],
      ['հաց', '', ''],
      ['ջուր', 'вода', 'jur'],
    ]
    const out = applyMapping(rows, roles, true)
    expect(out.rows.map((r) => r.line)).toEqual([2, 6])
    expect(out.skipped).toBe(1)
    expect(out.errors).toEqual([
      { line: 4, raw: ' | хлеб | ', reason: 'Нет армянского слова' },
      { line: 5, raw: 'հաց |  | ', reason: 'Нет перевода' },
    ])
  })

  it('без заголовка первая строка — данные', () => {
    const out = applyMapping([['բարև', 'привет']], roles, false)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].line).toBe(1)
  })

  it('«пустая» строка считается по сопоставленным колонкам', () => {
    const out = applyMapping([['', '', '', 'заметка']], roles, false)
    expect(out.skipped).toBe(1)
    expect(out.errors).toHaveLength(0)
  })

  it('ошибки валидации полей как при вставке', () => {
    const out = applyMapping([['barev', 'привет', '']], roles, false)
    expect(out.errors[0].reason).toContain('Здесь нужно слово армянскими буквами')
    const out2 = applyMapping([['բարև', 'привет', 'բարև']], roles, false)
    expect(out2.errors[0].reason).toContain('В транслитерации есть недопустимые символы')
  })

  it('короткие строки (меньше колонок) не падают', () => {
    const out = applyMapping([['բարև']], roles, false)
    expect(out.errors[0].reason).toBe('Нет перевода')
  })

  it('число строк данных', () => {
    expect(dataRowCount([['h'], ['a'], ['b']], true)).toBe(2)
    expect(dataRowCount([['h'], ['a'], ['b']], false)).toBe(3)
    expect(dataRowCount([], true)).toBe(0)
    expect(tooManyRowsMessage(3412)).toBe(
      'В файле 3412 строк, максимум 3000. Разделите файл на части.',
    )
  })
})

describe('101–103: колонка «Набор»', () => {
  const roles: Role[] = ['set', 'hy', 'ru']
  it('название набора попадает в строку; пустое — null', () => {
    const out = applyMapping(
      [
        ['Урок 5', 'բարև', 'привет'],
        ['', 'հաց', 'хлеб'],
      ],
      roles,
      false,
    )
    expect(out.rows.map((r) => r.setTitle)).toEqual(['Урок 5', null])
  })
  it('название длиннее 50 символов — ошибка строки', () => {
    const out = applyMapping([['х'.repeat(51), 'բարև', 'привет']], roles, false)
    expect(out.errors[0].reason).toBe('Название набора длиннее 50 символов')
  })
  it('пробелы в названии нормализуются', () => {
    const out = applyMapping([['  Урок   5 ', 'բարև', 'привет']], roles, false)
    expect(out.rows[0].setTitle).toBe('Урок 5')
  })
})

describe('95: защита от формул при импорте', () => {
  it('удаляется один первый апостроф', () => {
    expect(unprotectFormula("'-ый суффикс")).toBe('-ый суффикс')
    expect(unprotectFormula("'=1+1")).toBe('=1+1')
    expect(unprotectFormula("'+7")).toBe('+7')
    expect(unprotectFormula("'@home")).toBe('@home')
    expect(unprotectFormula("''-x")).toBe("'-x")
  })
  it('остальные значения не меняются', () => {
    expect(unprotectFormula("'привет")).toBe("'привет")
    expect(unprotectFormula('-ый')).toBe('-ый')
    expect(unprotectFormula("don't")).toBe("don't")
    expect(unprotectFormula('')).toBe('')
  })
  it('применяется к ячейкам при разборе', () => {
    const out = applyMapping([['բարև', "'-ый суффикс"]], ['hy', 'ru'], false)
    expect(out.rows[0].ru).toBe('-ый суффикс')
  })
})

describe('формат будущего экспорта (BOM, «;», CRLF, кавычки) загружается без настройки', () => {
  const file =
    '\uFEFFset;hy;ru;translit;example_hy;example_ru\r\n' +
    'Урок 5;բարև;привет;;;\r\n' +
    'Урок 5;"լավ, բարի";"хорошо; ""добрый""";;;\r\n' +
    'Урок 5;տուն;"дом\r\nжилище";tun;Տունը մեծ է։;Дом большой.\r\n'
  it('колонки опознаны по заголовкам, строки разобраны', () => {
    const text = decodeUtf8(new TextEncoder().encode(file))!
    const { rows, delimiter } = parseCsvAuto(text)
    expect(delimiter).toBe(';')
    const m = detectMapping(rows)
    expect(m.roles).toEqual(['set', 'hy', 'ru', 'translit', 'exampleHy', 'exampleRu'])
    expect(mappingProblems(m.roles)).toEqual([])
    const out = applyMapping(rows, m.roles, m.hasHeader)
    expect(out.errors).toEqual([])
    expect(out.rows.map((r) => r.hy)).toEqual(['բարև', 'լավ, բարի', 'տուն'])
    expect(out.rows[1].ru).toBe('хорошо; "добрый"')
    expect(out.rows[2].ru).toBe('дом жилище')
  })
})
