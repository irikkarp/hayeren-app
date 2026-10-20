import { describe, expect, it } from 'vitest'
import { parseCsvAuto } from './csv'
import { applyMapping, detectMapping } from './importFile'
import { parsePaste } from './paste'
import {
  buildPreviewItems,
  countNewSets,
  LIMIT_MESSAGES,
  planSave,
  type ExistingSet,
  type PreviewContext,
} from './preview'
import { normalizeKey } from './text'

let n = 0
const ids = () => ({ set: () => `set-${++n}`, word: () => `u-${++n}` })
const keys = (...hy: string[]) => new Set(hy.map(normalizeKey))
const existing = (id: string, title: string, ...hy: string[]): ExistingSet => ({
  id,
  title,
  keys: keys(...hy),
})
const newTarget = (title = 'Набор от 19.10'): PreviewContext => ({
  sets: [],
  defaultTarget: { type: 'new', title },
})

describe('57: дубликаты', () => {
  it('повтор внутри списка: «Повтор строки N» (номер первой встречи), первая строка не помечена', () => {
    const { rows } = parsePaste('բարև — привет\nհաց — хлеб\nԲարև — здравствуй')
    const items = buildPreviewItems(rows, newTarget())
    expect(items.map((i) => i.duplicate)).toEqual([null, null, { kind: 'file', line: 1 }])
  })

  it('ключ нормализуется: регистр, եւ/և, армянские знаки, пробелы', () => {
    const { rows } = parsePaste('բարեւ — а\nԲարև — б\nՈ՞վ — в\nով  — г')
    const items = buildPreviewItems(rows, newTarget())
    expect(items[1].duplicate).toEqual({ kind: 'file', line: 1 })
    expect(items[3].duplicate).toEqual({ kind: 'file', line: 3 })
  })

  it('совпадение со словом выбранного набора: «Уже есть в наборе»', () => {
    const { rows } = parsePaste('բարև — привет\nհաց — хлеб')
    const ctx: PreviewContext = {
      sets: [existing('s1', 'Урок 5', 'բարև')],
      defaultTarget: { type: 'existing', setId: 's1' },
    }
    expect(buildPreviewItems(rows, ctx).map((i) => i.duplicate)).toEqual([
      { kind: 'existing' },
      null,
    ])
  })

  it('другие наборы и новый набор дубликатами не считаются', () => {
    const { rows } = parsePaste('բարև — привет')
    const ctx: PreviewContext = {
      sets: [existing('s1', 'Урок 5', 'բարև'), existing('s2', 'Урок 6')],
      defaultTarget: { type: 'existing', setId: 's2' },
    }
    expect(buildPreviewItems(rows, ctx)[0].duplicate).toBeNull()
    expect(buildPreviewItems(rows, newTarget())[0].duplicate).toBeNull()
  })
})

describe('102–103: колонка «Набор»', () => {
  const csv =
    'set;hy;ru\n' +
    'Урок 5;բարև;привет\n' +
    'урок 5;հաց;хлеб\n' +
    'Урок 6;բարև;здравствуй\n' +
    ';ջուր;вода\n' +
    'Урок 6;բարև;привет!\n'
  const { rows } = parseCsvAuto(csv)
  const m = detectMapping(rows)
  const out = applyMapping(rows, m.roles, m.hasHeader)

  it('строки группируются по названию без учёта регистра; пустая ячейка — набор по умолчанию', () => {
    const ctx: PreviewContext = {
      sets: [existing('s5', 'Урок 5')],
      defaultTarget: { type: 'new', title: 'Набор от 19.10' },
    }
    const items = buildPreviewItems(out.rows, ctx)
    expect(items.map((i) => [i.targetTitle, i.isNewSet])).toEqual([
      ['Урок 5', false],
      ['Урок 5', false],
      ['Урок 6', true],
      ['Набор от 19.10', true],
      ['Урок 6', true],
    ])
    expect(countNewSets(items)).toBe(2)
  })

  it('дубликаты — внутри набора: то же слово в разных наборах не дубликат', () => {
    const items = buildPreviewItems(out.rows, newTarget())
    // «բարև» есть в «Урок 5» (строка 2) и дважды в «Урок 6» (строки 4 и 6)
    expect(items.map((i) => i.duplicate)).toEqual([
      null,
      null,
      null,
      null,
      { kind: 'file', line: 4 },
    ])
  })
})

describe('44, 40, 91: план сохранения', () => {
  const rows = parsePaste('բարև — привет\nհաց — хлеб\nջուր; вода; jur').rows

  it('новый набор: набор и слова, порядок сохраняется (createdAt растёт), авто-транслитерация', () => {
    const items = buildPreviewItems(rows, newTarget())
    const res = planSave(items, newTarget(), { setCount: 0, wordCount: 0 }, 1000, ids())
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const { newSets, words } = res.plan
    expect(newSets).toHaveLength(1)
    expect(newSets[0]).toMatchObject({ title: 'Набор от 19.10', deletedAt: null })
    expect(words.map((w) => w.hy)).toEqual(['բարև', 'հաց', 'ջուր'])
    expect(words.map((w) => w.translit)).toEqual(['barev', "hats'", 'jur'])
    expect(words.map((w) => w.translitAuto)).toEqual([true, true, false])
    expect(words.every((w) => w.setId === newSets[0].id && w.id.startsWith('u-'))).toBe(true)
    const t = words.map((w) => w.createdAt)
    expect([...t].sort((a, b) => a - b)).toEqual(t)
    expect(new Set(t).size).toBe(3)
    expect(res.plan.touchedTitles).toEqual(['Набор от 19.10'])
  })

  it('в существующий набор: новых наборов нет', () => {
    const ctx: PreviewContext = {
      sets: [existing('s1', 'Урок 5')],
      defaultTarget: { type: 'existing', setId: 's1' },
    }
    const res = planSave(buildPreviewItems(rows, ctx), ctx, { setCount: 1, wordCount: 0 }, 1, ids())
    expect(res.ok && res.plan.newSets).toEqual([])
    expect(res.ok && res.plan.words.every((w) => w.setId === 's1')).toBe(true)
  })

  it('новые наборы получают растущее createdAt в порядке файла (старый → новый)', () => {
    const csv = 'set;hy;ru\nA;ա;а\nB;բ;б\nA;գ;в\n'
    const { rows: table } = parseCsvAuto(csv)
    const m = detectMapping(table)
    const parsed = applyMapping(table, m.roles, m.hasHeader)
    const ctx = newTarget()
    const res = planSave(
      buildPreviewItems(parsed.rows, ctx),
      ctx,
      { setCount: 0, wordCount: 0 },
      100,
      ids(),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.plan.newSets.map((s) => s.title)).toEqual(['A', 'B'])
    expect(res.plan.newSets[0].createdAt).toBeLessThan(res.plan.newSets[1].createdAt)
    expect(res.plan.words.map((w) => w.setId)).toEqual([
      res.plan.newSets[0].id,
      res.plan.newSets[1].id,
      res.plan.newSets[0].id,
    ])
  })

  it('44: лимит слов — ничего не сохраняется, сообщение с числами', () => {
    const items = buildPreviewItems(rows, newTarget())
    const res = planSave(items, newTarget(), { setCount: 0, wordCount: 2999 }, 1, ids())
    expect(res).toEqual({
      ok: false,
      error: { kind: 'limit', message: LIMIT_MESSAGES.words(2999, 3) },
    })
    expect(LIMIT_MESSAGES.words(2999, 3)).toBe(
      'Можно хранить не больше 3000 своих слов. Сейчас: 2999, добавляете: 3.',
    )
    expect(planSave(items, newTarget(), { setCount: 0, wordCount: 2997 }, 1, ids()).ok).toBe(true)
  })

  it('44: лимит наборов', () => {
    const items = buildPreviewItems(rows, newTarget())
    const res = planSave(items, newTarget(), { setCount: 100, wordCount: 0 }, 1, ids())
    expect(res).toEqual({
      ok: false,
      error: { kind: 'limit', message: 'Можно создать не больше 100 наборов.' },
    })
    expect(planSave(items, newTarget(), { setCount: 99, wordCount: 0 }, 1, ids()).ok).toBe(true)
  })

  it('40: название нового набора проверяется', () => {
    const empty = newTarget('  ')
    const r1 = planSave(
      buildPreviewItems(rows, empty),
      empty,
      { setCount: 0, wordCount: 0 },
      1,
      ids(),
    )
    expect(r1).toMatchObject({ ok: false, error: { kind: 'title', error: 'empty' } })
    const ctx: PreviewContext = {
      sets: [existing('s1', 'Урок 5')],
      defaultTarget: { type: 'new', title: 'урок 5' },
    }
    const r2 = planSave(buildPreviewItems(rows, ctx), ctx, { setCount: 1, wordCount: 0 }, 1, ids())
    expect(r2).toMatchObject({ ok: false, error: { kind: 'title', error: 'duplicate' } })
  })

  it('пустой выбор — ничего не сохраняем', () => {
    expect(planSave([], newTarget(), { setCount: 0, wordCount: 0 }, 1, ids())).toEqual({
      ok: false,
      error: { kind: 'empty' },
    })
  })
})
