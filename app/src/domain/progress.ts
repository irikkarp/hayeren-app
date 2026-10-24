// «Видимый прогресс» (001 ред. 11, критерии 149–160): подсчёты выучено / в изучении / не начато,
// строка прогресса, ширины сегментов бара, ближайшая дата повторения и тексты итога сессии.
import type { DateKey } from './dates'
import { daysBetween } from './dates'
import { plural } from './plural'
import { LEARNED_BOX } from './srs'
import type { ProgressMap } from './types'

export interface ProgressCounts {
  /** Есть состояние и box ≥ 4. */
  learned: number
  /** Есть состояние и box 1–3. */
  learning: number
  /** Состояния нет. */
  notStarted: number
  total: number
}

/**
 * Единственная функция подсчёта (критерий 149). Всегда learned + learning + notStarted = total.
 * Состояния слов, которых нет в `words`, не учитываются (критерий 31, 163ж).
 */
export function progressCounts(
  words: readonly { id: string }[],
  states: ProgressMap,
): ProgressCounts {
  let learned = 0
  let learning = 0
  for (const w of words) {
    const p = states[w.id]
    if (!p) continue
    if (p.box >= LEARNED_BOX) learned++
    else learning++
  }
  return { learned, learning, notStarted: words.length - learned - learning, total: words.length }
}

/** Куски строки «выучено X · в изучении Y из N» (куски не рвутся при переносе, дизайн S02). */
export function progressParts(c: ProgressCounts): {
  head: string
  learning: string | null
  tail: string
} {
  return {
    head: `выучено ${c.learned}`,
    learning: c.learning > 0 ? `в изучении ${c.learning}` : null,
    tail: `из ${c.total}`,
  }
}

/** Строка прогресса темы и набора (критерий 150); у пустого набора — «0 слов». */
export function progressLine(c: ProgressCounts): string {
  if (c.total === 0) return '0 слов'
  const p = progressParts(c)
  return p.learning ? `${p.head} · ${p.learning} ${p.tail}` : `${p.head} ${p.tail}`
}

/** `aria-valuetext` бара (критерий 152в). */
export function progressValueText(c: ProgressCounts): string {
  return c.learning > 0
    ? `выучено ${c.learned}, в изучении ${c.learning} из ${c.total}`
    : `выучено ${c.learned} из ${c.total}`
}

/** Ширины сегментов бара в процентах (критерий 151). Для N = 0 обе ширины 0. */
export function segmentWidths(c: ProgressCounts): { learned: number; learning: number } {
  if (c.total <= 0) return { learned: 0, learning: 0 }
  return { learned: (c.learned / c.total) * 100, learning: (c.learning / c.total) * 100 }
}

/** Ближайшая дата повторения: минимальный dueDate среди слов с состоянием (критерий 157). */
export function nextReviewDate(
  words: readonly { id: string }[],
  states: ProgressMap,
): DateKey | null {
  let min: DateKey | null = null
  for (const w of words) {
    const p = states[w.id]
    if (p && (min === null || p.dueDate < min)) min = p.dueDate
  }
  return min
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

/** «сегодня» / «завтра» / «послезавтра» / «28 октября» / «5 января 2027» (критерий 158). */
export function formatReviewDate(date: DateKey, today: DateKey): string {
  const diff = daysBetween(today, date)
  if (diff <= 0) return 'сегодня'
  if (diff === 1) return 'завтра'
  if (diff === 2) return 'послезавтра'
  const [y, m, d] = date.split('-').map(Number)
  const base = `${d} ${MONTHS[m - 1]}`
  return y === Number(today.slice(0, 4)) ? base : `${base} ${y}`
}

/** «Следующее повторение — завтра» (на главной без точки, в итоге сессии с точкой). */
export function nextReviewText(date: DateKey, today: DateKey, withDot = false): string {
  return `Следующее повторение — ${formatReviewDate(date, today)}${withDot ? '.' : ''}`
}

export const NO_PROGRESS_TEXT = 'Пока нечего повторять: начните с любой темы'

/**
 * Текст при N = 0 для плитки и для места рядом с кнопкой (критерий 159): один источник.
 * Нет состояний — подсказка, иначе дата ближайшего повторения.
 */
export function noDueText(next: DateKey | null, today: DateKey): string {
  return next === null ? NO_PROGRESS_TEXT : nextReviewText(next, today)
}

/** «новое слово / новых слова / новых слов» (критерий 155). */
export const newWordsWord = (n: number) => plural(n, ['новое слово', 'новых слова', 'новых слов'])

/** «В теме «…» осталось K новых слов.»; K = 0 — строки нет. */
export function remainingNewText(k: number, kind: 'topic' | 'set', title: string): string | null {
  if (k <= 0) return null
  return `В ${kind === 'topic' ? 'теме' : 'наборе'} «${title}» осталось ${k} ${newWordsWord(k)}.`
}

export const SCHEME_TEXT =
  'Слово становится выученным после двух повторений: через 2 дня и ещё через 4.'
export const SCHEME_ALL_DONT_TEXT = 'Выученными слова станут после нескольких успешных повторений.'

export interface ExplainInput {
  /** Общая сессия «Повторить (N)». */
  isReview: boolean
  /** Слова, получившие состояние впервые в этой сессии (m), и сколько из них получили «Знаю». */
  newCount: number
  newKnow: number
  /** Слов к повторению после сессии (N) и есть ли у пользователя хоть одно состояние. */
  dueLeft: number
  nextDate: DateKey | null
  today: DateKey
  /** Не начатые слова темы или набора (K); для общей сессии 0. */
  remainingNew: number
  targetKind: 'topic' | 'set'
  targetTitle: string
}

export interface ExplainView {
  /** Группа «что произошло». */
  lead: { title: string; detail: string } | null
  /** Группа «что дальше». */
  next: string[]
}

/** Сборка пояснительного блока итога (критерии 154–156, 160). Пустой блок не рисуется. */
export function buildExplain(i: ExplainInput): ExplainView {
  const lead =
    !i.isReview && i.newCount > 0
      ? {
          title: `Новых слов в изучении: ${i.newCount}.`,
          detail: i.newKnow > 0 ? SCHEME_TEXT : SCHEME_ALL_DONT_TEXT,
        }
      : null
  const next: string[] = []
  if (i.dueLeft === 0 && i.nextDate !== null) next.push(nextReviewText(i.nextDate, i.today, true))
  if (!i.isReview) {
    const k = remainingNewText(i.remainingNew, i.targetKind, i.targetTitle)
    if (k) next.push(k)
  }
  return { lead, next }
}
