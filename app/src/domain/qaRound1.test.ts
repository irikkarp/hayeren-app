// QA, повторная проверка (круг 1): независимые проверки ред. 7 (кр. 49, 57, 60, 61, 66).
import { describe, expect, it } from 'vitest'
import { parsePaste } from './paste'
import { normalizeKey } from './text'
import { parseCsvAuto } from './csv'
import { buildPreviewItems } from './preview'

const T = '\t'
const one = (s: string) => {
  const o = parsePaste(s)
  return { row: o.rows[0], err: o.errors[0]?.reason, n: o.rows.length, e: o.errors.length }
}

describe('QA круг 1: контрольные примеры 66 (ред. 7)', () => {
  const ok: [string, string, string, string, boolean][] = [
    ['բարև — привет', 'բարև', 'привет', 'barev', true],
    ['привет - բարև', 'բարև', 'привет', 'barev', true],
    [`1) հաց${T}хлеб`, 'հաց', 'хлеб', "hats'", true],
    ['ջուր; вода; jur', 'ջուր', 'вода', 'jur', false],
    ['• կաթ–молоко', 'կաթ', 'молоко', "kat'", true],
    ['хорошо — լավ, բարի', 'լավ, բարի', 'хорошо', '', true],
    ['по-русски — ռուսերեն', 'ռուսերեն', 'по-русски', '', true],
    ['բարև — привет; здравствуйте', 'բարև', 'привет; здравствуйте', 'barev', true],
    [`հաց${T}хлеб; булка`, 'հաց', 'хлеб; булка', '', true],
    ['սուրճ — кофе; surj', 'սուրճ', 'кофе; surj', '', true],
    [`սուրճ${T}кофе${T}surj`, 'սուրճ', 'кофе', 'surj', false],
    ['սուրճ; кофе; sur’j', 'սուրճ', 'кофе', "sur'j", false],
    ['սուրճ; кофе; sur‘j', 'սուրճ', 'кофе', "sur'j", false],
    ['սուրճ; кофе; surʼj', 'սուրճ', 'кофе', "sur'j", false],
    ['սուրճ; кофе; sur-j ə', 'սուրճ', 'кофе', 'sur-j ə', false],
  ]
  for (const [inp, hy, ru, tr, auto] of ok) {
    it(inp, () => {
      const r = one(inp)
      expect(r.err).toBeUndefined()
      expect(r.row.hy).toBe(hy)
      expect(r.row.ru).toBe(ru)
      const it = buildPreviewItems([r.row], {
        sets: [],
        defaultTarget: { type: 'new', title: 'N' },
      })[0]
      if (tr) expect(it.translit).toBe(tr)
      expect(it.translitAuto).toBe(auto)
    })
  }
  const bad: [string, RegExp][] = [
    ['shuka — рынок', /ни в одной/],
    ['կաթ молоко', /Не найден разделитель/],
    ['սուրճ — кофе — կոֆե', /обеих частях/],
    [`սուրճ${T}кофе${T}sûrj`, /û/],
    ['սուրճ; кофе; sur_j', /_/],
    ['սուրճ; кофе; é', /é/],
    ['սուրճ; кофе; 5', /5/],
  ]
  for (const [inp, re] of bad) {
    it('ошибка: ' + inp, () => {
      const r = one(inp)
      expect(r.n).toBe(0)
      expect(r.err).toMatch(re)
    })
  }
  it('ԵՎ/Եվ/եւ/և — один ключ; Երևան = Երեվան', () => {
    const k = ['և', 'եվ', 'եւ', 'ԵՎ', 'Եվ'].map(normalizeKey)
    expect(new Set(k).size).toBe(1)
    expect(normalizeKey('Երևան')).toBe(normalizeKey('Երեվան'))
  })
  it('CSV: непарная кавычка — ошибка с номером строки', () => {
    const o = parseCsvAuto('hy;ru\nբարև;"привет\nհաց;хлеб\nջուր;вода\n')
    expect(o.unclosedAt).toBe(2)
  })
})
