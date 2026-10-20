import { describe, expect, it } from 'vitest'
import { decodeUtf8, parseCsvAuto } from './csv'
import {
  buildCsv,
  buildExportFile,
  csvField,
  exportFileName,
  fileNameTitle,
  formatBackupDate,
  protectFormula,
  selectForExport,
} from './exportCsv'
import { applyMapping, detectMapping, unprotectFormula } from './importFile'
import { buildPreviewItems, existingSets, planSave } from './preview'
import type { UserSet, UserWord } from './types'

const set = (id: string, title: string, createdAt: number): UserSet => ({
  id,
  title,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
})
let seq = 0
const word = (setId: string, hy: string, ru: string, extra: Partial<UserWord> = {}): UserWord => ({
  id: `u-${++seq}`,
  setId,
  hy,
  ru,
  translit: '',
  translitAuto: true,
  exampleHy: '',
  exampleRu: '',
  createdAt: 1000 + seq,
  updatedAt: 1000 + seq,
  deletedAt: null,
  ...extra,
})

/** Данные критерия 104: ручная и авто-транслитерация, примеры, трудные символы, формула, `եւ`. */
function hardData() {
  const sets = [
    set('s2', 'Кухня и еда', 2000),
    set('s1', 'Урок 5', 1000),
    set('s3', 'Пустой', 3000),
  ]
  const words = [
    word('s1', 'բարև', 'привет', { translit: 'barev', translitAuto: false }),
    word('s1', 'տուն', 'дом, жильё; ещё "дом"', {
      translit: 'tun',
      translitAuto: false,
      exampleHy: 'Տունը մեծ է։',
      exampleRu: 'Дом большой.',
    }),
    word('s1', 'եւ', '-ый суффикс'),
    word('s1', 'հաց', "'=хлеб", { translit: 'hac', translitAuto: false }),
    word('s2', 'ջուր', 'вода 🙂 +1', {
      exampleHy: 'Ջուրը սառն է։',
      exampleRu: '@' + 'я'.repeat(150),
    }),
    word('s2', 'թեյ', '=чай', { exampleHy: 'Թեյ։', exampleRu: '' }),
  ]
  return { sets, words }
}

describe('защита от формул (95)', () => {
  it('добавляет апостроф к значению, начинающемуся с = + - @ (в том числе после апострофов)', () => {
    for (const v of ['=1', '+1', '-ый', '@x', "'=x", "''-x"])
      expect(protectFormula(v)).toBe(`'${v}`)
    for (const v of ['', 'abc', "'abc", 'a-b', ' -x']) expect(protectFormula(v)).toBe(v)
  })
  it('в обе стороны: импорт возвращает исходное значение', () => {
    for (const v of ['=1', '+1', '-ый суффикс', '@x', "'=x", "''-x", "'-"]) {
      expect(unprotectFormula(protectFormula(v))).toBe(v)
    }
  })
})

describe('экранирование (92)', () => {
  it('значения с ; , " и переводом строки берутся в кавычки, кавычки удваиваются', () => {
    expect(csvField('a;b')).toBe('"a;b"')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('он сказал "да"')).toBe('"он сказал ""да"""')
    expect(csvField('a\nb')).toBe('"a\nb"')
    expect(csvField('a\r\nb')).toBe('"a\r\nb"')
    expect(csvField('простое')).toBe('простое')
    expect(csvField('')).toBe('')
  })
})

describe('файл экспорта (92–94)', () => {
  const file = buildExportFile(hardData().sets, hardData().words, new Date(2026, 9, 17))!
  const bytes = new TextEncoder().encode(file.text)

  it('начинается с байтов EF BB BF', () => {
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(file.text.startsWith('﻿')).toBe(true)
    expect(file.text.slice(1).startsWith('﻿')).toBe(false)
  })

  it('заголовки, разделитель «;» и переводы строк CRLF вне кавычек', () => {
    expect(file.text.slice(1).split('\r\n')[0]).toBe('set;hy;ru;translit;example_hy;example_ru')
    const withoutQuoted = file.text.replace(/"(?:[^"]|"")*"/g, '""')
    expect(withoutQuoted).not.toMatch(/(?<!\r)\n/)
    expect(withoutQuoted.endsWith('\r\n')).toBe(true)
    expect(
      withoutQuoted
        .split('\r\n')
        .slice(1, -1)
        .every((l) => l.split(';').length === 6),
    ).toBe(true)
  })

  it('порядок: наборы по дате создания, слова по порядку добавления; пустые наборы не выгружаются', () => {
    const t = parseCsvAuto(decodeUtf8(bytes)!, ';')
    expect(t.rows.slice(1).map((r) => [r[0], r[1]])).toEqual([
      ['Урок 5', 'բարև'],
      ['Урок 5', 'տուն'],
      ['Урок 5', 'եւ'],
      ['Урок 5', 'հաց'],
      ['Кухня и еда', 'ջուր'],
      ['Кухня и еда', 'թեյ'],
    ])
    expect(file.setCount).toBe(2)
    expect(file.wordCount).toBe(6)
  })

  it('авто-транслитерация — пустая ячейка, ручная — как хранится, `եւ` без изменений', () => {
    const rows = parseCsvAuto(decodeUtf8(bytes)!, ';').rows
    expect(rows[1][3]).toBe('barev')
    expect(rows[3][1]).toBe('եւ')
    expect(rows[3][3]).toBe('')
    expect(rows[3][2]).toBe("'-ый суффикс")
    expect(rows[4][2]).toBe("''=хлеб")
  })

  it('удалённые наборы и слова не выгружаются; набор без слов даёт null', () => {
    const { sets, words } = hardData()
    const gone = words.map((w) => (w.setId === 's1' ? { ...w, deletedAt: 5 } : w))
    expect(selectForExport(sets, gone).setCount).toBe(1)
    expect(buildExportFile(sets, [], new Date())).toBeNull()
    expect(buildExportFile(sets, words, new Date(), 's3')).toBeNull()
  })

  it('экспорт одного набора: только его слова, в имени название набора', () => {
    const { sets, words } = hardData()
    const one = buildExportFile(sets, words, new Date(2026, 9, 17), 's2')!
    expect(one.fileName).toBe('hayeren-words-Кухня и еда-2026-10-17.csv')
    expect(one.wordCount).toBe(2)
    expect(
      parseCsvAuto(one.text.slice(1), ';')
        .rows.slice(1)
        .map((r) => r[0]),
    ).toEqual(['Кухня и еда', 'Кухня и еда'])
  })
})

describe('имя файла (96)', () => {
  const d = new Date(2026, 0, 5, 23, 59)
  it('все слова: локальная дата', () => {
    expect(exportFileName(d)).toBe('hayeren-words-2026-01-05.csv')
  })
  it('символы \\ / : * ? " < > | и переводы строк заменяются на _', () => {
    expect(exportFileName(d, 'Урок 5/6: часть "А"')).toBe(
      'hayeren-words-Урок 5_6_ часть _А_-2026-01-05.csv',
    )
    expect(fileNameTitle('a\\b|c\nd<e>f*g?h')).toBe('a_b_c_d_e_f_g_h')
  })
  it('длина названия ограничена 50 символами', () => {
    expect(Array.from(fileNameTitle('я'.repeat(80)))).toHaveLength(50)
    expect(Array.from(fileNameTitle('🙂'.repeat(60)))).toHaveLength(50)
  })
})

describe('дата последней копии (98)', () => {
  it('ДД.ММ.ГГГГ по локальному времени', () => {
    expect(formatBackupDate(new Date(2026, 0, 5, 12).getTime())).toBe('05.01.2026')
  })
})

describe('сериализатор и разбор CSV взаимно обратны (107а)', () => {
  it('значения с ;, ", запятой, переводом строки, формулами и эмодзи', () => {
    const tricky = [
      'a;b',
      'с "кавычками"',
      'строка1\nстрока2',
      'строка1\r\nстрока2',
      '-ый суффикс',
      '=1+1',
      "'-x",
      '🙂',
      'я'.repeat(500),
      '',
    ]
    const { sets } = hardData()
    const words = tricky.map((v) =>
      word('s1', 'բարև', v, { exampleRu: v, translit: v, translitAuto: false }),
    )
    const text = buildCsv(selectForExport(sets, words, 's1'))
    const rows = parseCsvAuto(decodeUtf8(new TextEncoder().encode(text))!, ';').rows
    expect(rows).toHaveLength(tricky.length + 1)
    rows.slice(1).forEach((r, i) => {
      const v = tricky[i]
      expect(r.map(unprotectFormula)).toEqual(['Урок 5', 'բարև', v, v, '', v])
    })
  })
})

/** Файл экспорта → вся цепочка импорта (разбор, колонки, предпросмотр, план сохранения). */
function importText(text: string, sets: UserSet[], words: UserWord[]) {
  const table = parseCsvAuto(decodeUtf8(new TextEncoder().encode(text))!)
  const mapping = detectMapping(table.rows)
  const parsed = applyMapping(table.rows, mapping.roles, mapping.hasHeader)
  const items = buildPreviewItems(parsed.rows, {
    sets: existingSets(sets, words),
    defaultTarget: { type: 'new', title: 'Набор от 17.10' },
  })
  return { table, mapping, parsed, items }
}

describe('обязательный сквозной тест: экспорт → импорт (104–106)', () => {
  const { sets, words } = hardData()
  const exported = buildExportFile(sets, words, new Date(2026, 9, 17))!

  it('колонки опознаются по заголовкам, «Первая строка — заголовки» включена, ошибок нет', () => {
    const { table, mapping, parsed } = importText(exported.text, [], [])
    expect(table.delimiter).toBe(';')
    expect(mapping.hasHeader).toBe(true)
    expect(mapping.detectedBy).toBe('headers')
    expect(mapping.roles).toEqual(['set', 'hy', 'ru', 'translit', 'exampleHy', 'exampleRu'])
    expect(parsed.errors).toEqual([])
  })

  it('восстанавливаются те же наборы, слова, порядок, поля и метка «авто»', () => {
    const { items } = importText(exported.text, [], [])
    let n = 0
    const res = planSave(
      items,
      { sets: [], defaultTarget: { type: 'new', title: 'x' } },
      { setCount: 0, wordCount: 0 },
      50_000,
      { set: () => `ns-${++n}`, word: () => `nu-${++n}` },
    )
    if (!res.ok) throw new Error('plan failed')
    const { newSets, words: restored } = res.plan
    // Порядок наборов по дате создания и названия совпадают с исходными (без пустого).
    expect(newSets.sort((a, b) => a.createdAt - b.createdAt).map((s) => s.title)).toEqual([
      'Урок 5',
      'Кухня и еда',
    ])
    const titleOf = new Map(newSets.map((s) => [s.id, s.title]))
    const orig = words
      .filter((w) => w.setId !== 's3')
      .sort((a, b) => a.setId.localeCompare(b.setId) || a.createdAt - b.createdAt)
    const key = (w: { hy: string }, t: string) => `${t}|${w.hy}`
    const sortedRestored = [...restored].sort((a, b) => a.createdAt - b.createdAt)
    expect(sortedRestored.map((w) => key(w, titleOf.get(w.setId)!))).toEqual(
      [...orig]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((w) => key(w, sets.find((s) => s.id === w.setId)!.title)),
    )
    for (const r of sortedRestored) {
      const o = words.find(
        (w) => w.hy === r.hy && sets.find((s) => s.id === w.setId)!.title === titleOf.get(r.setId),
      )!
      expect({
        hy: r.hy,
        ru: r.ru,
        translit: r.translitAuto ? '' : r.translit,
        auto: r.translitAuto,
        exampleHy: r.exampleHy,
        exampleRu: r.exampleRu,
      }).toEqual({
        hy: o.hy,
        ru: o.ru,
        translit: o.translitAuto ? '' : o.translit,
        auto: o.translitAuto,
        exampleHy: o.exampleHy,
        exampleRu: o.exampleRu,
      })
    }
  })

  it('перевод строки внутри значения сворачивается импортом в пробел (нормализация текста, критерий 45)', () => {
    const w = [word('s1', 'տուն', 'дом\nжильё')]
    const f = buildExportFile([set('s1', 'Урок', 1)], w, new Date())!
    expect(f.text).toContain('"дом\nжильё"')
    expect(importText(f.text, [], []).parsed.rows[0].ru).toBe('дом жильё')
  })

  it('повторная загрузка: все строки «Уже есть в наборе» (105)', () => {
    const { items } = importText(exported.text, sets, words)
    expect(items).toHaveLength(6)
    expect(items.every((i) => i.duplicate?.kind === 'existing')).toBe(true)
  })

  it('файл одного набора создаёт набор с тем же названием и словами в том же порядке (106)', () => {
    const one = buildExportFile(sets, words, new Date(2026, 9, 17), 's1')!
    const { items } = importText(one.text, [], [])
    expect(items.map((i) => i.targetTitle)).toEqual(Array(4).fill('Урок 5'))
    expect(items.map((i) => i.row.hy)).toEqual(['բարև', 'տուն', 'եւ', 'հաց'])
    expect(items.map((i) => i.row.ru)).toEqual([
      'привет',
      'дом, жильё; ещё "дом"',
      '-ый суффикс',
      "'=хлеб",
    ])
    expect(items.map((i) => i.translitAuto)).toEqual([false, false, true, false])
  })
})
