/** QA этапа 3: экспорт CSV. Дополнительные проверки поверх тестов программиста. */
import { describe, expect, it } from 'vitest'
import { parseCsvAuto } from './csv'
import {
  buildCsv,
  buildExportFile,
  exportFileName,
  fileNameTitle,
  selectForExport,
} from './exportCsv'
import { detectMapping, unprotectFormula } from './importFile'
import { normalizeText } from './text'
import type { UserSet, UserWord } from './types'

const mkSet = (id: string, title: string, createdAt: number): UserSet => ({
  id,
  title,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
})
let n = 0
const mkWord = (setId: string, hy: string, ru: string, o: Partial<UserWord> = {}): UserWord => ({
  id: `w${++n}`,
  setId,
  hy,
  ru,
  translit: '',
  translitAuto: true,
  exampleHy: '',
  exampleRu: '',
  createdAt: n,
  updatedAt: n,
  deletedAt: null,
  ...o,
})

describe('QA 3: байты файла (92–94)', () => {
  it('точное содержимое: BOM, CRLF, «;», кавычки, пустая авто-транслитерация, защита во всех полях', () => {
    const sets = [mkSet('a', '=Набор; "1"', 1)]
    const words = [
      mkWord('a', '-հաց', '+хлеб', {
        translit: '@hac',
        translitAuto: false,
        exampleHy: '=x',
        exampleRu: "'-y",
      }),
      mkWord('a', 'եւ', 'и'),
    ]
    const text = buildCsv(selectForExport(sets, words))
    expect(text).toBe(
      '\uFEFF' +
        'set;hy;ru;translit;example_hy;example_ru\r\n' +
        `"'=Набор; ""1""";'-հաց;'+хлеб;'@hac;'=x;''-y\r\n` +
        `"'=Набор; ""1""";եւ;и;;;\r\n`,
    )
  })

  it('кодировка в байтах: EF BB BF, затем UTF-8 без суррогатных половинок', () => {
    const bytes = new TextEncoder().encode(
      buildCsv(selectForExport([mkSet('a', 'A', 1)], [mkWord('a', 'ա', 'я 🙂')])),
    )
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toContain('🙂')
  })
})

describe('QA 3: имя файла (96)', () => {
  const d = new Date(2026, 0, 5)
  it('армянское и эмодзи-название, обрезка по символам, а не по кодовым единицам', () => {
    expect(exportFileName(d, 'Բարև')).toBe('hayeren-words-Բարև-2026-01-05.csv')
    const t = '🙂'.repeat(60)
    expect(Array.from(fileNameTitle(t))).toHaveLength(50)
    expect(() => encodeURIComponent(fileNameTitle(t))).not.toThrow()
  })
  it('название из одних запрещённых символов', () => {
    expect(exportFileName(d, '/:*?')).toBe('hayeren-words-____-2026-01-05.csv')
  })
  it('локальная дата в полночь и в 23:59', () => {
    expect(exportFileName(new Date(2026, 11, 31, 23, 59, 59))).toBe('hayeren-words-2026-12-31.csv')
    expect(exportFileName(new Date(2027, 0, 1, 0, 0, 1))).toBe('hayeren-words-2027-01-01.csv')
  })
  it('пробелы и точки по краям названия не ломают имя (после названия идёт дата)', () => {
    expect(exportFileName(d, ' x. ')).toBe('hayeren-words- x. -2026-01-05.csv')
  })
})

describe('QA 3: round-trip на случайных трудных данных (107а)', () => {
  const alphabet = [
    ';',
    ',',
    '"',
    '\n',
    '\r\n',
    "'",
    '=',
    '-',
    '+',
    '@',
    'a',
    'ա',
    'Ե',
    'ւ',
    ' ',
    'ы',
    '🙂',
    '\t',
  ]
  let seed = 12345
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const rstr = (min: number) => {
    const len = min + Math.floor(rnd() * 6)
    let s = ''
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)]
    return s
  }

  it('2000 случайных слов возвращаются без потерь (с поправкой на нормализацию пробелов)', () => {
    const sets = [mkSet('a', 'Набор', 1)]
    const words: UserWord[] = []
    for (let i = 0; i < 2000; i++) {
      const hy = normalizeText(rstr(1)) || 'ա'
      const ru = normalizeText(rstr(1)) || 'я'
      words.push(
        mkWord('a', hy, ru, {
          translit: normalizeText(rstr(0)),
          translitAuto: false,
          exampleHy: normalizeText(rstr(0)),
          exampleRu: normalizeText(rstr(0)),
        }),
      )
    }
    const file = buildExportFile(sets, words, new Date(2026, 0, 1))!
    const table = parseCsvAuto(file.text.slice(1))
    expect(table.delimiter).toBe(';')
    const mapping = detectMapping(table.rows)
    expect(mapping.hasHeader).toBe(true)
    for (const [i, w] of words.entries()) {
      const cells = table.rows[i + 1].map((c) => normalizeText(unprotectFormula(c)))
      expect(cells).toEqual(['Набор', w.hy, w.ru, w.translit, w.exampleHy, w.exampleRu])
    }
    expect(table.rows).toHaveLength(2001)
  })
})
