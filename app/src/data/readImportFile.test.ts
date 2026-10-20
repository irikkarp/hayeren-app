/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyMapping, detectMapping } from '../domain/importFile'
import { FILE_ERRORS, readImportFile } from './readImportFile'

const fixture = (name: string) => {
  const bytes = readFileSync(`e2e/fixtures/${name}`)
  return new File([new Uint8Array(bytes)], name)
}
const fromText = (name: string, text: string) => new File([text], name)

describe('чтение файлов импорта (критерии 71–73)', () => {
  it('CSV с BOM и «;» из русского Excel', async () => {
    const res = await readImportFile(fixture('lesson-semicolon.csv'))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.file.rows[0]).toEqual(['Слово', 'Перевод', 'Произношение', 'Заметки'])
    expect(res.file.rows).toHaveLength(6)
    const m = detectMapping(res.file.rows)
    expect(m.roles).toEqual(['hy', 'ru', 'translit', 'skip'])
    expect(applyMapping(res.file.rows, m.roles, m.hasHeader).rows).toHaveLength(5)
  })

  it('CSV с табуляцией без заголовков: колонки по содержимому, пустая строка сохраняет нумерацию', async () => {
    const res = await readImportFile(fixture('lesson-tab-noheader.csv'))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const m = detectMapping(res.file.rows)
    expect(m).toMatchObject({
      hasHeader: false,
      detectedBy: 'content',
      roles: ['skip', 'hy', 'ru'],
    })
    const out = applyMapping(res.file.rows, m.roles, m.hasHeader)
    expect(out.rows.map((r) => r.line)).toEqual([1, 2, 5])
    expect(out.skipped).toBe(1)
    expect(out.errors).toEqual([{ line: 4, raw: 'թեյ | ', reason: 'Нет перевода' }])
  })

  it('формат будущего экспорта: колонки опознаны сами', async () => {
    const res = await readImportFile(fixture('backup-format.csv'))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const m = detectMapping(res.file.rows)
    expect(m.roles).toEqual(['set', 'hy', 'ru', 'translit', 'exampleHy', 'exampleRu'])
    const out = applyMapping(res.file.rows, m.roles, m.hasHeader)
    expect(out.errors).toEqual([])
    expect(out.rows).toHaveLength(5)
    expect(out.rows[1].ru).toBe('дом, жильё; ещё "дом"')
    expect(out.rows[2]).toMatchObject({ hy: 'եւ', ru: '-ый суффикс' })
    expect(out.rows.map((r) => r.setTitle)).toEqual([
      'Урок 5',
      'Урок 5',
      'Урок 5',
      'Кухня и еда',
      'Кухня и еда',
    ])
  })

  it('XLSX: первый лист, число и результат формулы как текст, уведомление о нескольких листах', async () => {
    const res = await readImportFile(fixture('lesson.xlsx'))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.file.sheetName).toBe('Урок 7')
    expect(res.file.multiSheet).toBe(true)
    expect(res.file.rows[0]).toEqual(['hy', 'ru', 'translit', 'example_hy'])
    expect(res.file.rows[3]).toEqual(['երկու', '2', '', ''])
    expect(res.file.rows[4][1]).toBe('десять')
    const m = detectMapping(res.file.rows)
    expect(applyMapping(res.file.rows, m.roles, m.hasHeader).rows).toHaveLength(4)
  })

  it('71: неподдерживаемый формат (.xls и другие)', async () => {
    for (const name of ['old-format.xls', 'a.ods', 'a.numbers', 'a.txt', 'noext']) {
      expect(await readImportFile(fromText(name, 'x'))).toEqual({
        ok: false,
        error: FILE_ERRORS.format,
      })
    }
  })

  it('71: больше 5 МБ', async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.csv')
    expect(await readImportFile(big)).toEqual({ ok: false, error: 'Файл больше 5 МБ' })
    const edge = new File([new Uint8Array(5 * 1024 * 1024).fill(97)], 'edge.csv')
    expect((await readImportFile(edge)).ok).toBe(true) // ровно 5 МБ допустимо
  })

  it('71: 3000 строк данных проходят, 3001 — нет', async () => {
    const make = (n: number) =>
      'hy;ru\n' + Array.from({ length: n }, (_, i) => `ա${i};вода`).join('\n')
    expect((await readImportFile(fromText('a.csv', make(3000)))).ok).toBe(true)
    expect(await readImportFile(fromText('a.csv', make(3001)))).toEqual({
      ok: false,
      error: 'В файле 3001 строк, максимум 3000. Разделите файл на части.',
    })
    // без заголовка 3000 строк — тоже предел
    const noHeader = Array.from({ length: 3001 }, (_, i) => `ա${i};вода`).join('\n')
    expect(await readImportFile(fromText('a.csv', noHeader))).toEqual({
      ok: false,
      error: 'В файле 3001 строк, максимум 3000. Разделите файл на части.',
    })
  })

  it('72: не UTF-8 (Windows-1251)', async () => {
    expect(await readImportFile(fixture('cp1251.csv'))).toEqual({
      ok: false,
      error: 'Файл не в кодировке UTF-8. В Excel выберите «Файл → Сохранить как → CSV UTF-8».',
    })
  })

  it('73: повреждённый или защищённый паролем xlsx', async () => {
    expect(await readImportFile(fromText('a.xlsx', 'это не zip'))).toEqual({
      ok: false,
      error: FILE_ERRORS.unreadable,
    })
  })

  it('пустой файл', async () => {
    expect(await readImportFile(fromText('a.csv', ''))).toEqual({
      ok: false,
      error: FILE_ERRORS.empty,
    })
  })
})
