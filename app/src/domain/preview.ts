import { newUserWordId, newUuid } from './ids'
import type { ParsedRow } from './parsedRows'
import { wordTranslit } from './parsedRows'
import { normalizeKey, normalizeText } from './text'
import type { UserSet, UserWord } from './types'
import { makeUserSet, makeUserWord } from './userWords'
import { wordKeys } from './userWords'
import { LIMITS, validateSetTitle, type SetTitleError } from './wordValidation'

/** Существующий набор с ключами его живых слов (для поиска дубликатов). */
export interface ExistingSet {
  id: string
  title: string
  keys: ReadonlySet<string>
}

/** Наборы с ключами слов для предпросмотра; новые сверху (как на главном экране). */
export function existingSets(sets: readonly UserSet[], words: readonly UserWord[]): ExistingSet[] {
  return [...sets]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => ({
      id: s.id,
      title: s.title,
      keys: wordKeys(words.filter((w) => w.setId === s.id)),
    }))
}

/** Куда сохранять строки без названия набора: существующий набор или новый. */
export type DefaultTarget = { type: 'existing'; setId: string } | { type: 'new'; title: string }

export interface PreviewContext {
  sets: readonly ExistingSet[]
  defaultTarget: DefaultTarget
}

export type Duplicate = { kind: 'file'; line: number } | { kind: 'existing' }

export interface PreviewItem {
  /** Позиция в списке распознанных (стабильный ключ для флажков). */
  index: number
  row: ParsedRow
  /** Транслитерация к показу и сохранению. */
  translit: string
  translitAuto: boolean
  /** Ключ целевого набора: `id:<id>` или `new:<название в нижнем регистре>`. */
  targetKey: string
  targetTitle: string
  /** Набор будет создан при сохранении. */
  isNewSet: boolean
  duplicate: Duplicate | null
}

const lower = (s: string) => normalizeText(s).toLowerCase()

function resolveTarget(row: ParsedRow, ctx: PreviewContext) {
  const byTitle = (title: string) => {
    const hit = ctx.sets.find((s) => lower(s.title) === lower(title))
    return hit
      ? { key: `id:${hit.id}`, title: hit.title, isNew: false, existing: hit }
      : { key: `new:${lower(title)}`, title: normalizeText(title), isNew: true, existing: null }
  }
  if (row.setTitle) return byTitle(row.setTitle)
  const d = ctx.defaultTarget
  if (d.type === 'existing') {
    const hit = ctx.sets.find((s) => s.id === d.setId)
    if (hit) return { key: `id:${hit.id}`, title: hit.title, isNew: false, existing: hit }
  }
  const title = d.type === 'new' ? d.title : ''
  return {
    key: `new:${lower(title)}`,
    title: normalizeText(title),
    isNew: true,
    existing: null,
  }
}

/**
 * Строки предпросмотра с целевым набором и признаком дубликата (критерии 57, 102–103).
 * Дубликат — тот же нормализованный `hy` в том же наборе: либо повтор внутри списка
 * («Повтор строки N» — номер первой встречи), либо слово, уже лежащее в наборе.
 */
export function buildPreviewItems(rows: readonly ParsedRow[], ctx: PreviewContext): PreviewItem[] {
  const seen = new Map<string, number>() // `${targetKey}|${ключ}` → номер строки первой встречи
  return rows.map((row, index) => {
    const target = resolveTarget(row, ctx)
    const key = normalizeKey(row.hy)
    const seenKey = `${target.key}|${key}`
    let duplicate: Duplicate | null = null
    const first = seen.get(seenKey)
    if (first !== undefined) duplicate = { kind: 'file', line: first }
    else {
      seen.set(seenKey, row.line)
      if (target.existing?.keys.has(key)) duplicate = { kind: 'existing' }
    }
    const { translit, auto } = wordTranslit(row)
    return {
      index,
      row,
      translit,
      translitAuto: auto,
      targetKey: target.key,
      targetTitle: target.title,
      isNewSet: target.isNew,
      duplicate,
    }
  })
}

/** Сколько новых наборов создадут строки (для сводки «Новых наборов: K», критерий 103). */
export function countNewSets(items: readonly PreviewItem[]): number {
  return new Set(items.filter((i) => i.isNewSet).map((i) => i.targetKey)).size
}

export const LIMIT_MESSAGES = {
  words: (have: number, adding: number) =>
    `Можно хранить не больше ${LIMITS.words} своих слов. Сейчас: ${have}, добавляете: ${adding}.`,
  sets: `Можно создать не больше ${LIMITS.sets} наборов.`,
} as const

export type PlanError =
  | { kind: 'limit'; message: string }
  | { kind: 'title'; error: SetTitleError; title: string }
  | { kind: 'empty' }

export interface SavePlan {
  newSets: UserSet[]
  words: UserWord[]
  /** Наборы, в которые попали слова (по порядку первого появления). */
  touchedSetIds: string[]
  /** Названия наборов по тем же индексам. */
  touchedTitles: string[]
}

export interface PlanCounts {
  setCount: number
  wordCount: number
}

/**
 * План сохранения отмеченных строк (критерии 40, 44, 102–103). Лимиты проверяются до записи:
 * при превышении не сохраняется ничего. Порядок: наборы и слова получают растущее `createdAt`
 * в порядке строк, поэтому порядок слов и наборов восстанавливается (критерий 91).
 */
export function planSave(
  items: readonly PreviewItem[],
  ctx: PreviewContext,
  counts: PlanCounts,
  now: number,
  makeId: { set: () => string; word: () => string } = { set: newUuid, word: newUserWordId },
): { ok: true; plan: SavePlan } | { ok: false; error: PlanError } {
  if (items.length === 0) return { ok: false, error: { kind: 'empty' } }

  // Названия новых наборов: правила критерия 40.
  const existingTitles = ctx.sets.map((s) => s.title)
  const newTargets = new Map<string, string>()
  for (const i of items)
    if (i.isNewSet && !newTargets.has(i.targetKey)) newTargets.set(i.targetKey, i.targetTitle)
  for (const title of newTargets.values()) {
    const error = validateSetTitle(title, existingTitles)
    if (error) return { ok: false, error: { kind: 'title', error, title } }
  }

  if (counts.setCount + newTargets.size > LIMITS.sets) {
    return { ok: false, error: { kind: 'limit', message: LIMIT_MESSAGES.sets } }
  }
  if (counts.wordCount + items.length > LIMITS.words) {
    return {
      ok: false,
      error: { kind: 'limit', message: LIMIT_MESSAGES.words(counts.wordCount, items.length) },
    }
  }

  let tick = now
  const idByKey = new Map<string, string>()
  const newSets: UserSet[] = []
  for (const i of items) {
    if (idByKey.has(i.targetKey)) continue
    if (i.isNewSet) {
      const id = makeId.set()
      idByKey.set(i.targetKey, id)
      newSets.push(makeUserSet(id, i.targetTitle, tick++))
    } else idByKey.set(i.targetKey, i.targetKey.slice(3))
  }
  const words = items.map((i) =>
    makeUserWord(
      makeId.word(),
      idByKey.get(i.targetKey)!,
      {
        hy: i.row.hy,
        ru: i.row.ru,
        translit: i.translitAuto ? '' : i.translit,
        exampleHy: i.row.exampleHy,
        exampleRu: i.row.exampleRu,
      },
      tick++,
      now,
    ),
  )
  const touchedSetIds = [...idByKey.values()]
  const titleOf = new Map(items.map((i) => [idByKey.get(i.targetKey)!, i.targetTitle]))
  return {
    ok: true,
    plan: {
      newSets,
      words,
      touchedSetIds,
      touchedTitles: touchedSetIds.map((id) => titleOf.get(id)!),
    },
  }
}
