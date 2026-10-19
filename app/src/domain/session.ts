import type { DateKey } from './dates'
import { daysWord } from './plural'
import { applyAnswer, BOX_INTERVALS } from './srs'
import type { QueueItem } from './queue'
import type { ProgressMap, WordProgress } from './types'

export type Verdict = 'know' | 'dont'

export interface SessionState {
  /** Оставшиеся карточки: первая — текущая. */
  queue: QueueItem[]
  /** Сколько карточек (с учётом повторных показов) уже пройдено. */
  handled: number
  /** Первый ответ на каждое слово: по нему считаются «Пройдено / Знаю / Не знаю». */
  first: Record<string, Verdict>
}

export interface AnswerContext {
  progress: ProgressMap
  today: DateKey
  now: number
}

/** Что нужно сохранить после ответа (не для повторного показа). */
export interface AnswerUpdate {
  progress: WordProgress
  wasNew: boolean
  prevBox: number | null
}

/** Что показать в тосте после ответа. */
export type Feedback =
  { type: 'know'; days: number } | { type: 'dont-first' } | { type: 'again'; know: boolean }

export interface AnswerOutcome {
  session: SessionState
  update: AnswerUpdate | null
  feedback: Feedback
}

export interface SessionStats {
  passed: number
  know: number
  dont: number
}

export function createSession(queue: QueueItem[]): SessionState {
  return { queue, handled: 0, first: {} }
}

export const currentItem = (s: SessionState): QueueItem | undefined => s.queue[0]
export const isFinished = (s: SessionState): boolean => s.queue.length === 0

/**
 * Ответ на текущую карточку (правила 1–3, критерии 15–18).
 * Первый ответ меняет состояние слова; «Не знаю» ставит слово в конец очереди один раз.
 * Ответ на повторный показ состояние не меняет.
 */
export function answer(s: SessionState, verdict: Verdict, ctx: AnswerContext): AnswerOutcome {
  const item = s.queue[0]
  if (!item) throw new Error('Очередь сессии пуста')
  const rest = s.queue.slice(1)
  const know = verdict === 'know'

  if (item.kind === 'again') {
    return {
      session: { ...s, queue: rest, handled: s.handled + 1 },
      update: null,
      feedback: { type: 'again', know },
    }
  }

  const prev = ctx.progress[item.wordId]
  const progress = applyAnswer(item.wordId, prev, know, ctx.today, ctx.now)
  const queue: QueueItem[] = know ? rest : [...rest, { wordId: item.wordId, kind: 'again' }]
  return {
    session: {
      queue,
      handled: s.handled + 1,
      first: { ...s.first, [item.wordId]: verdict },
    },
    update: { progress, wasNew: !prev, prevBox: prev ? prev.box : null },
    feedback: know ? { type: 'know', days: BOX_INTERVALS[progress.box] } : { type: 'dont-first' },
  }
}

/** Убирает из очереди слова, которых больше нет (удалены во время сессии, критерий 82). */
export function dropMissing(s: SessionState, alive: ReadonlySet<string>): SessionState {
  const queue = s.queue.filter((i) => alive.has(i.wordId))
  return queue.length === s.queue.length ? s : { ...s, queue }
}

/** «Пройдено» считает слова, а не показы (повтор после «Не знаю» не удваивает числа). */
export function sessionStats(s: SessionState): SessionStats {
  const verdicts = Object.values(s.first)
  const know = verdicts.filter((v) => v === 'know').length
  return { passed: verdicts.length, know, dont: verdicts.length - know }
}

export function sessionProgress(s: SessionState): { done: number; total: number; left: number } {
  return { done: s.handled, total: s.handled + s.queue.length, left: s.queue.length }
}

export function feedbackText(f: Feedback): string {
  if (f.type === 'dont-first') return 'Не знаю · покажем ещё раз в конце'
  if (f.type === 'again') return `${f.know ? 'Знаю' : 'Не знаю'} · слово вернётся завтра`
  if (f.days === 1) return 'Знаю · вернёмся к слову завтра'
  return `Знаю · вернёмся к слову через ${f.days} ${daysWord(f.days)}`
}
