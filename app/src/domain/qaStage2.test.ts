// QA этапа 2: неожиданные входы и бывшие баги (исправлены, .fails сняты).
import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv, parseCsvAuto, type Delimiter } from './csv'
import { applyMapping, detectMapping, unprotectFormula } from './importFile'
import { parsePaste } from './paste'
import { buildPreviewItems } from './preview'
import { normalizeKey } from './text'
import { transliterate } from './translit'
import { normalizeWordInput, validateWordInput } from './wordValidation'

/** Детерминированный генератор псевдослучайных чисел (mulberry32). */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHABET = [
  ...'բարևհացջուրկաթ',
  ...'abcxyz',
  ...'привет',
  ...' \t;,—–-"\'\r\n',
  ...'•*1.2)=+@',
  ...'🙂​ ﻿<>&',
]

describe('QA: разбор вставки и CSV не падают на мусоре', () => {
  it('parsePaste: на любом тексте сумма строк сходится, исключений нет', () => {
    const rand = rng(42)
    for (let n = 0; n < 400; n++) {
      const len = Math.floor(rand() * 200)
      const text = Array.from(
        { length: len },
        () => ALPHABET[Math.floor(rand() * ALPHABET.length)],
      ).join('')
      const out = parsePaste(text)
      const nonEmpty = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '').length
      expect(out.rows.length + out.errors.length).toBe(nonEmpty)
      for (const r of out.rows) {
        expect(validateWordInput(normalizeWordInput(r))).toEqual({})
        expect(r.hy).not.toBe('')
        expect(r.ru).not.toBe('')
      }
    }
  })

  it('parseCsv: значения с разделителями, кавычками и переводами строк проходят круг RFC 4180', () => {
    const rand = rng(7)
    const delims: Delimiter[] = [';', ',', '\t']
    const pool = [...'ab ա,;\t"\n\r\'=-', 'բարև', 'при"вет', '\n\n']
    for (let n = 0; n < 300; n++) {
      const d = delims[n % 3]
      const cols = 2 + Math.floor(rand() * 3)
      const rows = 1 + Math.floor(rand() * 6)
      const table = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () =>
          // не допускаем полностью пустую строку и пустые хвостовые строки: они по спецификации отбрасываются
          Array.from(
            { length: 1 + Math.floor(rand() * 6) },
            () => pool[Math.floor(rand() * pool.length)],
          ).join(''),
        ),
      )
      const csv = table
        .map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(d))
        .join(n % 2 ? '\r\n' : '\n')
      expect(parseCsv(csv, d)).toEqual(table)
    }
  })

  it('detectDelimiter: «;» с запятыми в кавычках и табуляция с запятыми', () => {
    expect(detectDelimiter('hy;ru\nլավ, բարի;"хорошо, добрый"\n')).toBe(';')
    expect(detectDelimiter('hy\tru\nլավ, բարի\tхорошо, добрый\n')).toBe('\t')
    expect(detectDelimiter('hy,ru\nհաց,хлеб\n')).toBe(',')
  })

  it('формулы: ячейки с =,+,-,@ остаются текстом; один апостроф снимается', () => {
    expect(unprotectFormula("'=1+1")).toBe('=1+1')
    expect(unprotectFormula("''-x")).toBe("'-x")
    expect(unprotectFormula("'abc")).toBe("'abc")
    expect(unprotectFormula('=1+1')).toBe('=1+1')
    const rows = [
      ['hy', 'ru'],
      ['բարև', '=HYPERLINK("http://x")'],
      ['հաց', '@SUM(A1)'],
    ]
    const m = detectMapping(rows)
    const out = applyMapping(rows, m.roles, m.hasHeader)
    expect(out.rows.map((r) => r.ru)).toEqual(['=HYPERLINK("http://x")', '@SUM(A1)'])
  })

  it('XSS-подобные значения не меняются (экранирование делает React)', () => {
    const out = parsePaste('բարև — <img src=x onerror=alert(1)>')
    expect(out.rows[0].ru).toBe('<img src=x onerror=alert(1)>')
  })

  it('BUG-10: CSV: непарная кавычка не должна молча склеивать остаток файла в одну ячейку', () => {
    const rows = parseCsvAuto('hy;ru\nբարև;"привет\nհաց;хлеб\nջուր;вода\n').rows
    // Сейчас: 2 строки, вторая содержит «привет\nհաց;хлеб\nջուր;вода». Ожидаем хотя бы пометку об ошибке.
    expect(rows.length).toBeGreaterThan(2)
  })
})

describe('QA: известные расхождения (решения контролёра)', () => {
  it('ԵՎ (заглавное) равно և при сравнении дубликатов', () => {
    expect(normalizeKey('ԵՎ')).toBe(normalizeKey('և'))
    expect(normalizeKey('Եվ')).toBe(normalizeKey('եւ'))
  })

  it('в транслитерации принимается типографский апостроф ’', () => {
    const f = normalizeWordInput({
      hy: 'թեյ',
      ru: 'чай',
      translit: 't’ey',
      exampleHy: '',
      exampleRu: '',
    })
    expect(validateWordInput(f)).toEqual({})
  })

  it('дубликат ԵՎ в одном списке помечается как «Повтор строки»', () => {
    const out = parsePaste('եւ — и\nԵՎ — и2')
    const items = buildPreviewItems(out.rows, {
      sets: [],
      defaultTarget: { type: 'new', title: 'Набор' },
    })
    expect(items[1].duplicate).not.toBeNull()
  })
})

describe('QA: баги', () => {
  it('BUG-9: разделитель «;» не теряется, если в каждой строке без заголовка по одинаковому числу запятых', () => {
    const text = 'հաց, նկանակ;хлеб, булка\nջուր, ըմպելիք;вода, напиток\n'
    expect(detectDelimiter(text)).toBe(';')
  })

  it('BUG-8: невидимые символы (ZWSP, LRM, мягкий перенос) убираются, а не дают ошибку «буквы: ​»', () => {
    const out = parsePaste('բար​և — привет')
    expect(out.errors).toEqual([])
    expect(out.rows[0].hy).toBe('բարև')
  })

  it('BUG-11: ошибка из-за «;» в переводе не должна перечислять символы «—, п, р, и…» как «латинские или русские буквы»', () => {
    const out = parsePaste('բարև — привет; здравствуйте')
    // допустимое поведение: либо разбор по тире, либо понятная причина без списка кириллицы
    const reason = out.errors[0]?.reason ?? ''
    expect(reason).not.toMatch(/буквы: —/)
  })

  it('транслитерация «как в схеме» для типичных слов', () => {
    expect(transliterate('անհամապատասխանություն')).toBe("anhamapataskhanut'yun")
  })
})

describe('описание невидимых символов в ошибках', () => {
  it('называет невидимый символ по коду', async () => {
    const { describeChar } = await import('./wordValidation')
    expect(describeChar('⁤')).toBe('невидимый символ (U+2064)')
    expect(describeChar('v')).toBe('v')
  })
})
