import { describe, expect, it } from 'vitest'
import { decodeUtf8, detectDelimiter, parseCsv, parseCsvAuto } from './csv'

const enc = (s: string) => new TextEncoder().encode(s)

describe('72: разбор CSV', () => {
  it('RFC 4180: кавычки, разделители и переводы строк внутри значений, удвоенные кавычки', () => {
    const text = 'a;"b;c";"d\r\ne ""q"""\r\nf;g;h\r\n'
    expect(parseCsv(text, ';')).toEqual([
      ['a', 'b;c', 'd\r\ne "q"'],
      ['f', 'g', 'h'],
    ])
  })

  it('CRLF, LF и CR; хвостовая пустая строка отбрасывается, пустые в середине остаются', () => {
    expect(parseCsv('a;b\nc;d\r\n\r\ne;f\r\n\r\n', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      [''],
      ['e', 'f'],
    ])
    expect(parseCsv('a;b\rc;d', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('пустые ячейки в конце строки сохраняются', () => {
    expect(parseCsv('a;b;\nc;;', ';')).toEqual([
      ['a', 'b', ''],
      ['c', '', ''],
    ])
  })

  it('кавычка внутри незакавыченного значения остаётся как есть', () => {
    expect(parseCsv('5" экран;x', ';')).toEqual([['5" экран', 'x']])
  })

  it('разделитель определяется по первым строкам: ; , табуляция', () => {
    expect(detectDelimiter('hy;ru\nա;а')).toBe(';')
    expect(detectDelimiter('hy,ru\nա,а')).toBe(',')
    expect(detectDelimiter('hy\tru\nա\tа')).toBe('\t')
  })

  it('запятая внутри значений не сбивает «;»', () => {
    const text = 'hy;ru\nլավ, բարի;хорошо, добрый\nկաթ;молоко'
    expect(detectDelimiter(text)).toBe(';')
    expect(parseCsvAuto(text).rows[1]).toEqual(['լավ, բարի', 'хорошо, добрый'])
  })

  it('запятая в кавычках не считается разделителем', () => {
    expect(detectDelimiter('"a,b";c\n"d,e";f')).toBe(';')
  })

  it('одна колонка: разделитель по умолчанию «,»', () => {
    expect(detectDelimiter('abc\ndef')).toBe(',')
    expect(parseCsvAuto('abc\ndef').rows).toEqual([['abc'], ['def']])
  })

  it('UTF-8 с BOM и без', () => {
    expect(decodeUtf8(enc('﻿hy;ru'))).toBe('hy;ru')
    expect(decodeUtf8(enc('բարև'))).toBe('բարև')
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('hy')])
    expect(decodeUtf8(withBom)).toBe('hy')
  })

  it('не UTF-8 (Windows-1251) даёт null', () => {
    // «привет» в cp1251
    const cp1251 = new Uint8Array([0xef, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2])
    expect(decodeUtf8(cp1251)).toBeNull()
  })
})
