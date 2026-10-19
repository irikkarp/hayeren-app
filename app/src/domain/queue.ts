import type { Catalog } from './catalog'
import type { DateKey } from './dates'
import { isDue } from './srs'
import type { CardWord, DayStats, ProgressMap } from './types'

export const SESSION_DUE_LIMIT = 30
export const DAILY_NEW_LIMIT = 10
export const NEW_BONUS = 10

/** Что проходит сессия: тема, свой набор или общее повторение «Повторить (N)». */
export type SessionTarget =
  { type: 'topic'; topicId: string } | { type: 'set'; setId: string } | { type: 'review' }

/** `again` — повторный показ в конце сессии после «Не знаю». */
export type ItemKind = 'new' | 'review' | 'again'

export interface QueueItem {
  wordId: string
  kind: ItemKind
}

export interface QueueContext {
  catalog: Catalog
  progress: ProgressMap
  today: DateKey
  /** Запись за сегодня (счётчик новых слов и добавка к лимиту). */
  day: DayStats | undefined
}

/**
 * Слова к повторению: самые просроченные первыми; при равной дате — по возрастанию коробки,
 * затем по id (порядок детерминирован, критерий 115).
 */
export function dueWords(catalog: Catalog, progress: ProgressMap, today: DateKey): CardWord[] {
  return catalog.words
    .filter((w) => isDue(progress[w.id], today))
    .sort((a, b) => {
      const pa = progress[a.id]
      const pb = progress[b.id]
      if (pa.dueDate !== pb.dueDate) return pa.dueDate < pb.dueDate ? -1 : 1
      if (pa.box !== pb.box) return pa.box - pb.box
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
}

/** Слова темы или набора. Для общего повторения пусто. */
export function targetWords(catalog: Catalog, target: SessionTarget): CardWord[] {
  if (target.type === 'topic') return catalog.topicWords(target.topicId)
  if (target.type === 'set') return catalog.setWords(target.setId)
  return []
}

/** Новые слова цели (без состояния) в порядке: встроенные — как в словаре, свои — как добавлены. */
export function newWordsOf(
  catalog: Catalog,
  progress: ProgressMap,
  target: SessionTarget,
): CardWord[] {
  return targetWords(catalog, target).filter((w) => progress[w.id] === undefined)
}

/** Сколько новых слов ещё можно начать сегодня. */
export function newCapacity(day: DayStats | undefined): number {
  return Math.max(0, DAILY_NEW_LIMIT + (day?.bonusNew ?? 0) - (day?.newStarted ?? 0))
}

/**
 * Очередь сессии (правило 6, критерии 14, 115–116): сначала до 30 слов к повторению из всех тем и
 * наборов, затем новые слова цели в пределах дневного лимита. Общее повторение — только долги.
 */
export function buildQueue(target: SessionTarget, ctx: QueueContext): QueueItem[] {
  const due = dueWords(ctx.catalog, ctx.progress, ctx.today)
    .slice(0, SESSION_DUE_LIMIT)
    .map((w): QueueItem => ({ wordId: w.id, kind: 'review' }))
  if (target.type === 'review') return due
  const fresh = newWordsOf(ctx.catalog, ctx.progress, target)
    .slice(0, newCapacity(ctx.day))
    .map((w): QueueItem => ({ wordId: w.id, kind: 'new' }))
  return [...due, ...fresh]
}

/** Дневной лимит исчерпан, а в цели ещё есть новые слова: можно предложить «Учить ещё 10». */
export function canLearnMore(target: SessionTarget, ctx: QueueContext): boolean {
  if (target.type === 'review') return false
  return newCapacity(ctx.day) === 0 && newWordsOf(ctx.catalog, ctx.progress, target).length > 0
}
