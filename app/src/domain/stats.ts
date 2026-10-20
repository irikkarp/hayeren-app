import type { DateKey } from './dates'
import { addDays } from './dates'
import type { Catalog } from './catalog'
import { isDue, isLearned } from './srs'
import type { DayMap, ProgressMap } from './types'

/**
 * N — число слов к повторению сегодня: у слова есть состояние и dueDate ≤ сегодня.
 * Эта функция — единственный источник числа и для плитки «Повторить сегодня», и для кнопки
 * «Повторить (N)» (критерий 112). Состояния слов, которых нет в каталоге, игнорируются (критерий 31).
 */
export function countDue(catalog: Catalog, progress: ProgressMap, today: DateKey): number {
  let n = 0
  for (const w of catalog.words) if (isDue(progress[w.id], today)) n++
  return n
}

/** Сколько слов выучено (box ≥ 4) среди слов каталога. */
export function learnedCount(catalog: Catalog, progress: ProgressMap): number {
  let n = 0
  for (const w of catalog.words) if (isLearned(progress[w.id])) n++
  return n
}

/** Есть ли хотя бы одно слово с состоянием (нужно для текста при N = 0). */
export function hasAnyProgress(catalog: Catalog, progress: ProgressMap): boolean {
  return catalog.words.some((w) => progress[w.id] !== undefined)
}

export interface TopicProgress {
  learned: number
  total: number
  isLearned: boolean
}

export function topicProgress(
  catalog: Catalog,
  topicId: string,
  progress: ProgressMap,
): TopicProgress {
  const words = catalog.topicWords(topicId)
  const learned = words.filter((w) => isLearned(progress[w.id])).length
  return { learned, total: words.length, isLearned: words.length > 0 && learned === words.length }
}

/**
 * Серия: число подряд идущих дней с ответами, заканчивающихся сегодня или вчера.
 * Если последний день с ответами раньше вчерашнего, серия 0.
 */
export function computeStreak(days: DayMap, today: DateKey): number {
  const active = (date: DateKey) => (days[date]?.answered ?? 0) > 0 && days[date].deletedAt == null
  let cursor: DateKey
  if (active(today)) cursor = today
  else if (active(addDays(today, -1))) cursor = addDays(today, -1)
  else return 0
  let streak = 0
  while (active(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

export interface SetProgress {
  learned: number
  total: number
}

/** Прогресс своего набора: «выучено X из N» (критерий 38). */
export function setProgress(catalog: Catalog, setId: string, progress: ProgressMap): SetProgress {
  const words = catalog.setWords(setId)
  return { learned: words.filter((w) => isLearned(progress[w.id])).length, total: words.length }
}
