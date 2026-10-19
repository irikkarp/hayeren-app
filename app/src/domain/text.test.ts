import { describe, expect, it } from 'vitest'
import { heroSizeClass, longestWordLength, normalizeKey, normalizeText } from './text'

describe('нормализация', () => {
  it('NFC, пробелы по краям и повторные пробелы', () => {
    expect(normalizeText('  բարև \t  Ձեզ ')).toBe('բարև Ձեզ')
    expect(normalizeText('é')).toBe('é')
  })

  it('ключ: регистр, եւ → և, армянские знаки', () => {
    expect(normalizeKey('ԲԱՐԵՎ')).toBe('բարեվ')
    expect(normalizeKey('Բարեւ')).toBe(normalizeKey('բարև'))
    expect(normalizeKey('Ինչպե՞ս')).toBe('ինչպես')
    expect(normalizeKey('  Բարև   Ձեզ ')).toBe('բարև ձեզ')
  })
})

describe('кегль слова на карточке (ui-kit 3.3)', () => {
  it('считает самое длинное слово, а не всю фразу', () => {
    expect(longestWordLength('բարի երեկո')).toBe(5)
    expect(longestWordLength('շնորհակալություն')).toBe(16)
  })

  it('пороги 9 / 12 / 13', () => {
    expect(heroSizeClass('բարև')).toBe('')
    expect(heroSizeClass('ա'.repeat(9))).toBe('')
    expect(heroSizeClass('ա'.repeat(10))).toBe('is-long')
    expect(heroSizeClass('ա'.repeat(12))).toBe('is-long')
    expect(heroSizeClass('ա'.repeat(13))).toBe('is-xlong')
    expect(heroSizeClass('շնորհակալություն')).toBe('is-xlong')
  })
})
