import { describe, expect, it } from 'vitest'
import { newUuid, newUserWordId } from './ids'
import { editUserWord, makeUserWord, translitFieldValue, wordStatus } from './userWords'

const fields = { hy: 'բարև', ru: 'привет', translit: '', exampleHy: '', exampleRu: '' }

describe('55: автотранслитерация при создании и изменении', () => {
  it('пустая транслитерация создаётся автоматически, введённая — ручная', () => {
    const auto = makeUserWord('u-1', 's', fields, 5)
    expect(auto).toMatchObject({
      translit: 'barev',
      translitAuto: true,
      createdAt: 5,
      updatedAt: 5,
    })
    const manual = makeUserWord('u-2', 's', { ...fields, translit: 'barev!' }, 5)
    expect(manual).toMatchObject({ translit: 'barev!', translitAuto: false })
  })

  it('auto + изменили hy и поле оставили пустым: пересчитывается', () => {
    const w = makeUserWord('u-1', 's', fields, 5)
    expect(translitFieldValue(w)).toBe('')
    const e = editUserWord(w, { ...fields, hy: 'հաց', translit: '' }, 9)
    expect(e).toMatchObject({ hy: 'հաց', translit: "hats'", translitAuto: true, updatedAt: 9 })
    expect(e.id).toBe('u-1')
    expect(e.setId).toBe('s')
    expect(e.createdAt).toBe(5)
  })

  it('исправили транслитерацию вручную: translitAuto = false', () => {
    const w = makeUserWord('u-1', 's', fields, 5)
    const e = editUserWord(w, { ...fields, translit: 'barev' }, 9)
    expect(e).toMatchObject({ translit: 'barev', translitAuto: false })
  })

  it('translitAuto = false: при изменении hy транслитерация не меняется', () => {
    const w = makeUserWord('u-1', 's', { ...fields, translit: 'custom' }, 5)
    expect(translitFieldValue(w)).toBe('custom')
    const e = editUserWord(w, { ...fields, hy: 'հաց', translit: translitFieldValue(w) }, 9)
    expect(e).toMatchObject({ hy: 'հաց', translit: 'custom', translitAuto: false })
  })

  it('поля нормализуются при изменении', () => {
    const w = makeUserWord('u-1', 's', fields, 5)
    const e = editUserWord(w, { ...fields, ru: '  привет   всем ' }, 9)
    expect(e.ru).toBe('привет всем')
  })
})

describe('статусы и идентификаторы', () => {
  it('80: новое / учу / выучено (box ≥ 4)', () => {
    expect(wordStatus(undefined)).toBe('new')
    expect(wordStatus(1)).toBe('learning')
    expect(wordStatus(3)).toBe('learning')
    expect(wordStatus(4)).toBe('learned')
    expect(wordStatus(5)).toBe('learned')
  })
  it('UUID v4, id слов с префиксом u-', () => {
    expect(newUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(newUserWordId()).toMatch(/^u-[0-9a-f-]{36}$/)
    expect(newUuid()).not.toBe(newUuid())
  })
})
