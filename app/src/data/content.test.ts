import { describe, expect, it } from 'vitest'
import { ALPHABET } from './alphabet'
import { content, validateContent } from './content'

describe('словарь words.json (критерии 36–37)', () => {
  it('36: 6 тем и 88 слов, темы в порядке order', () => {
    expect(content.topics).toHaveLength(6)
    expect(content.words).toHaveLength(88)
    expect(content.topics.map((t) => t.order)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('37: id уникальны, каждая тема объявлена, обязательные поля непустые', () => {
    expect(validateContent(content)).toEqual([])
  })

  it('validateContent находит нарушения', () => {
    const bad = {
      ...content,
      words: [
        content.words[0],
        { ...content.words[0] },
        { ...content.words[1], topic: 'nope' },
        { ...content.words[2], ru: '  ' },
      ],
    }
    const errors = validateContent(bad)
    expect(errors.some((e) => e.includes('повторяющийся id'))).toBe(true)
    expect(errors.some((e) => e.includes('неизвестная тема'))).toBe(true)
    expect(errors.some((e) => e.includes('пустое поле ru'))).toBe(true)
  })
})

describe('алфавит (критерий 32)', () => {
  it('39 букв с транслитерацией и подсказкой', () => {
    expect(ALPHABET).toHaveLength(39)
    for (const l of ALPHABET) {
      expect(l.lower).not.toBe('')
      expect(l.translit).not.toBe('')
      expect(l.hint).not.toBe('')
    }
    expect(ALPHABET.filter((l) => l.upper === '')).toHaveLength(1) // только `և` без заглавной
    expect(ALPHABET.some((l) => l.lower === 'ու')).toBe(true)
  })
})
