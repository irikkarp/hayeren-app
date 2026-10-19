import { describe, expect, it } from 'vitest'
import { daysWord, wordsWord } from './plural'

describe('склонение', () => {
  const cases: [number, string][] = [
    [0, 'дней'],
    [1, 'день'],
    [2, 'дня'],
    [4, 'дня'],
    [5, 'дней'],
    [11, 'дней'],
    [12, 'дней'],
    [14, 'дней'],
    [21, 'день'],
    [22, 'дня'],
    [25, 'дней'],
    [101, 'день'],
    [111, 'дней'],
    [112, 'дней'],
  ]
  it.each(cases)('%i -> %s', (n, form) => expect(daysWord(n)).toBe(form))

  it('слова', () => {
    expect([1, 2, 5, 11, 21, 45].map(wordsWord)).toEqual([
      'слово',
      'слова',
      'слов',
      'слов',
      'слово',
      'слов',
    ])
  })
})
