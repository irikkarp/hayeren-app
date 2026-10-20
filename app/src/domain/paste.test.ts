import { describe, expect, it } from 'vitest'
import { wordTranslit } from './parsedRows'
import {
  countPasteLines,
  parsePaste,
  PASTE_ERRORS,
  pasteTooLongMessage,
  splitParts,
  stripListMarker,
} from './paste'
import { MESSAGES } from './wordValidation'

/** Каждая строка вставляется отдельно в пустой набор (критерий 66). */
function one(line: string) {
  const out = parsePaste(line)
  expect(out.rows.length + out.errors.length).toBe(1)
  return out
}

describe('66: контрольные примеры вставки', () => {
  it('1. «բարև — привет»: hy, ru, авто-транслитерация barev', () => {
    const { rows } = one('բարև — привет')
    expect(rows[0]).toMatchObject({ hy: 'բարև', ru: 'привет', translit: '' })
    expect(wordTranslit(rows[0])).toEqual({ translit: 'barev', auto: true })
  })

  it('2. «привет - բարև»: армянское слово определяется само, порядок любой', () => {
    const { rows } = one('привет - բարև')
    expect(rows[0]).toMatchObject({ hy: 'բարև', ru: 'привет' })
  })

  it('3. «1) հաց⇥хлеб»: нумерация и табуляция', () => {
    const { rows } = one('1) հաց\tхлеб')
    expect(rows[0]).toMatchObject({ hy: 'հաց', ru: 'хлеб' })
  })

  it('4. «ջուр; вода; jur»: третья часть — ручная транслитерация (не авто)', () => {
    const { rows } = one('ջուր; вода; jur')
    expect(rows[0]).toMatchObject({ hy: 'ջուր', ru: 'вода', translit: 'jur' })
    expect(wordTranslit(rows[0])).toEqual({ translit: 'jur', auto: false })
  })

  it('5. «• կաթ–молоко»: маркер списка и тире без пробелов', () => {
    const { rows } = one('• կաթ–молоко')
    expect(rows[0]).toMatchObject({ hy: 'կաթ', ru: 'молоко' })
  })

  it('6. «хорошо — լավ, բարի»: запятая внутри армянского поля допустима', () => {
    const { rows } = one('хорошо — լավ, բարի')
    expect(rows[0]).toMatchObject({ hy: 'լավ, բարի', ru: 'хорошо' })
  })

  it('7. «shuka — рынок»: армянских букв нет ни в одной части', () => {
    const { errors } = one('shuka — рынок')
    expect(errors[0].reason).toBe(PASTE_ERRORS.noArmenian)
    expect(errors[0].reason).toContain('нет ни в одной части')
  })

  it('8. «կաթ молоко»: не найден разделитель', () => {
    const { errors } = one('կաթ молоко')
    expect(errors[0].reason).toBe(PASTE_ERRORS.noSeparator)
  })

  it('9. «սուրճ — кофе — կոֆե»: по первому тире, армянские буквы в обеих частях (ред. 7)', () => {
    const { errors } = one('սուրճ — кофе — կոֆե')
    expect(errors[0].reason).toBe(PASTE_ERRORS.bothArmenian)
  })

  it('10. «по-русски — ռուսերեն»: дефис без пробелов не разделитель', () => {
    const { rows } = one('по-русски — ռուսերեն')
    expect(rows[0]).toMatchObject({ hy: 'ռուսերեն', ru: 'по-русски' })
  })
})

describe('66 (ред. 7): новые контрольные примеры', () => {
  it('«;» в переводе при тире остаётся в переводе', () => {
    const { rows } = one('բարև — привет; здравствуйте')
    expect(rows[0]).toMatchObject({ hy: 'բարև', ru: 'привет; здравствуйте' })
    expect(wordTranslit(rows[0])).toEqual({ translit: 'barev', auto: true })
  })
  it('табуляция главнее «;»', () => {
    expect(one('հաց\tхлеб; булка').rows[0]).toMatchObject({ hy: 'հաց', ru: 'хлеб; булка' })
  })
  it('тире главнее «;»: транслитерация через «;» не берётся, генерируется', () => {
    const { rows } = one('սուրճ — кофе; surj')
    expect(rows[0]).toMatchObject({ hy: 'սուրճ', ru: 'кофе; surj', translit: '' })
    expect(wordTranslit(rows[0]).auto).toBe(true)
  })
  it('табуляция: третья часть — ручная транслитерация', () => {
    const { rows } = one('սուրճ\tкофе\tsurj')
    expect(rows[0]).toMatchObject({ translit: 'surj' })
    expect(wordTranslit(rows[0])).toEqual({ translit: 'surj', auto: false })
  })
  it('недопустимый символ в транслитерации: û', () => {
    const { errors } = one('սուրճ\tкофе\tsûrj')
    expect(errors[0].reason).toContain('недопустимые символы: û')
  })
  it("типографский апостроф заменяется на «'»", () => {
    const { rows } = one('սուրճ; кофе; sur’j')
    expect(rows[0].translit).toBe("sur'j")
  })
})

describe('разбор строк (59–62)', () => {
  it('пустые строки пропускаются и считаются, номера строк — по тексту', () => {
    const out = parsePaste('բարև — привет\n\n   \nհաց — хлеб\nshuka — рынок')
    expect(out.rows.map((r) => r.line)).toEqual([1, 4])
    expect(out.skipped).toBe(2)
    expect(out.errors.map((e) => e.line)).toEqual([5])
    expect(out.errors[0].raw).toBe('shuka — рынок')
  })

  it('CRLF и CR как переводы строк', () => {
    expect(parsePaste('ա — а\r\nբ — б\rգ — г').rows).toHaveLength(3)
  })

  it('нумерация и маркеры', () => {
    expect(stripListMarker('1. ա — а')).toBe('ա — а')
    expect(stripListMarker('12) ա — а')).toBe('ա — а')
    expect(stripListMarker('  • ա — а')).toBe('ա — а')
    expect(stripListMarker('* ա — а')).toBe('ա — а')
    expect(stripListMarker('- ա — а')).toBe('ա — а')
    // дефис без пробела — не маркер
    expect(stripListMarker('-ա — а')).toBe('-ա — а')
  })

  it('приоритет разделителей: табуляция, затем тире с пробелами, затем «;»', () => {
    expect(splitParts('ա; б\tв — г')).toEqual(['ա; б', 'в — г'])
    expect(splitParts('ա — б; в')).toEqual(['ա', 'б; в'])
    expect(splitParts('ա; б; в')).toEqual(['ա', 'б', 'в'])
    expect(splitParts('ա — б — в — г')).toEqual(['ա', 'б — в — г'])
    expect(splitParts('ա - б')).toEqual(['ա', 'б'])
    expect(splitParts('ա-б')).toBeNull()
    expect(splitParts('ա – б')).toEqual(['ա', 'б'])
    expect(splitParts('ա —б')).toEqual(['ա', 'б'])
  })

  it('армянские буквы в обеих частях', () => {
    expect(one('բարև — բարի').errors[0].reason).toBe(PASTE_ERRORS.bothArmenian)
  })

  it('нет перевода', () => {
    expect(one('բարև — ').errors[0].reason).toBe(PASTE_ERRORS.noRu)
    expect(one('բարև;').errors[0].reason).toBe(PASTE_ERRORS.noRu)
  })

  it('слишком много частей', () => {
    expect(one('ա; б; в; г').errors[0].reason).toBe(PASTE_ERRORS.tooManyParts)
  })

  it('ошибки валидации полей: смесь раскладок', () => {
    const { errors } = one('բարeւ — привет')
    expect(errors[0].reason).toContain('латинские или русские буквы: e')
  })

  it('слишком длинное армянское слово', () => {
    const { errors } = one(`${'ա'.repeat(61)} — слово`)
    expect(errors[0].reason).toBe(MESSAGES.tooLong(60))
  })

  it('пробелы нормализуются', () => {
    const { rows } = one('  բարև   ձեզ  —   добрый   день ')
    expect(rows[0]).toMatchObject({ hy: 'բարև ձեզ', ru: 'добрый день' })
  })
})

describe('58: лимит 500 непустых строк', () => {
  it('считает только непустые строки', () => {
    expect(countPasteLines('а\n\n  \nб')).toBe(2)
    expect(countPasteLines(Array.from({ length: 600 }, () => 'x').join('\n'))).toBe(600)
  })
  it('сообщение', () => {
    expect(pasteTooLongMessage(612)).toBe(
      'Слишком длинный список: 612 строк, максимум 500. Разделите его на части.',
    )
  })
})
