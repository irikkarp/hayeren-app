import { describe, expect, it } from 'vitest'
import {
  defaultSetTitle,
  firstErrorField,
  invalidArmenianChars,
  MESSAGES,
  normalizeWordInput,
  validateSetTitle,
  validateWordInput,
  type WordInput,
} from './wordValidation'

const ok: WordInput = { hy: 'բարև', ru: 'привет', translit: '', exampleHy: '', exampleRu: '' }
const check = (patch: Partial<WordInput>) =>
  validateWordInput(normalizeWordInput({ ...ok, ...patch }))

describe('45–47: армянское поле', () => {
  it('допустимые символы: буквы, пробел, дефис, цифры, , . ( ) и армянские знаки', () => {
    for (const hy of [
      'բարև',
      'լավ, բարի',
      'ա-բ',
      'տուն (մեծ)',
      'Ո՞վ',
      'ինչպե՞ս',
      'ա։',
      'ա՝ բ',
      'ա1',
      'ու',
      'եւ',
    ]) {
      expect(check({ hy }), hy).toEqual({})
    }
  })

  it('46: нет армянских букв — общая ошибка, в том числе для латиницы, кириллицы, пустого', () => {
    for (const hy of ['', '   ', 'barev', 'привет', '123', '- ,']) {
      expect(check({ hy }).hy, hy).toBe(MESSAGES.noArmenian)
    }
  })

  it('47: смесь — ошибка со списком недопустимых символов', () => {
    expect(check({ hy: 'կաfe' }).hy).toBe(MESSAGES.badChars(['f', 'e']))
    expect(check({ hy: 'բаrև' }).hy).toContain('а, r')
    expect(invalidArmenianChars('բаrаև')).toEqual(['а', 'r'])
    expect(check({ hy: 'բարև!' }).hy).toContain('!')
  })

  it('51: длина 60', () => {
    expect(check({ hy: 'ա'.repeat(60) }).hy).toBeUndefined()
    expect(check({ hy: 'ա'.repeat(61) }).hy).toBe('Слишком длинно: максимум 60 символов')
  })
})

describe('48–51: остальные поля', () => {
  it('48: перевод обязателен, лимит 100', () => {
    expect(check({ ru: '  ' }).ru).toBe('Введите перевод')
    expect(check({ ru: 'x'.repeat(100) }).ru).toBeUndefined()
    expect(check({ ru: 'x'.repeat(101) }).ru).toBe('Слишком длинно: максимум 100 символов')
  })

  it('49: транслитерация — латиница, ə, апостроф, пробел, дефис', () => {
    for (const translit of ['barev', "hats'", 'khəndrem', "ch' a-b", '']) {
      expect(check({ translit }).translit, translit).toBeUndefined()
    }
    for (const translit of ['բարև', 'привет', 'bar3v', 'a,b', 'a.b']) {
      expect(check({ translit }).translit, translit).toContain(
        'В транслитерации есть недопустимые символы',
      )
    }
    expect(check({ translit: 'a'.repeat(81) }).translit).toBe(
      'Слишком длинно: максимум 80 символов',
    )
  })

  it('50: пример проверяется как армянское поле; перевод примера — только вместе с примером', () => {
    expect(check({ exampleHy: 'Բարև ձեզ։', exampleRu: 'Здравствуйте.' })).toEqual({})
    expect(check({ exampleHy: 'hello' }).exampleHy).toBe(MESSAGES.noArmenian)
    expect(check({ exampleHy: 'Բարև hello' }).exampleHy).toContain('латинские или русские')
    expect(check({ exampleRu: 'Здравствуйте.' }).exampleRu).toBe(
      'Сначала заполните пример на армянском',
    )
    expect(check({ exampleHy: 'ա'.repeat(201) }).exampleHy).toBe(
      'Слишком длинно: максимум 200 символов',
    )
    expect(check({ exampleHy: 'ա', exampleRu: 'x'.repeat(201) }).exampleRu).toBe(
      'Слишком длинно: максимум 200 символов',
    )
  })

  it('51: нормализация — NFC, обрезка, схлопывание пробелов; написание hy не меняется', () => {
    const n = normalizeWordInput({
      hy: '  եւ   լավ ',
      ru: ' да \n нет ',
      translit: ' a  b ',
      exampleHy: ' ',
      exampleRu: 'é',
    })
    expect(n).toEqual({
      hy: 'եւ լավ',
      ru: 'да нет',
      translit: 'a b',
      exampleHy: '',
      exampleRu: 'é',
    })
  })

  it('68: первое поле с ошибкой — по порядку формы', () => {
    const errors = check({ hy: '', ru: '', translit: '1' })
    expect(firstErrorField(errors)).toBe('hy')
    expect(firstErrorField(check({ ru: '', translit: '1' }))).toBe('ru')
    expect(firstErrorField({})).toBeNull()
  })
})

describe('40: название набора', () => {
  it('1–50 символов, уникально без учёта регистра', () => {
    expect(validateSetTitle('Урок 5', [])).toBeNull()
    expect(validateSetTitle('  ', [])).toBe('empty')
    expect(validateSetTitle('x'.repeat(50), [])).toBeNull()
    expect(validateSetTitle('x'.repeat(51), [])).toBe('tooLong')
    expect(validateSetTitle('урок 5', ['Урок 5'])).toBe('duplicate')
    expect(validateSetTitle(' УРОК   5 ', ['Урок 5'])).toBe('duplicate')
    expect(validateSetTitle('Урок 6', ['Урок 5'])).toBeNull()
  })
  it('по умолчанию «Набор от ДД.ММ»', () => {
    expect(defaultSetTitle(new Date(2026, 9, 7))).toBe('Набор от 07.10')
    expect(defaultSetTitle(new Date(2026, 11, 31))).toBe('Набор от 31.12')
  })
})
