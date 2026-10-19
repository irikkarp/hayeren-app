import { addDays, type DateKey } from './dates'
import type { WordProgress } from './types'

/** Интервал до следующего показа после ответа «Знаю», по коробке, в днях. */
export const BOX_INTERVALS: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 }
export const MAX_BOX = 5
/** Слово выучено, если оно в этой коробке или выше. */
export const LEARNED_BOX = 4

export const isLearned = (p: WordProgress | undefined): boolean => !!p && p.box >= LEARNED_BOX

/** Слово «к повторению»: у него есть состояние и срок наступил (пропущенные дни не наказываются). */
export const isDue = (p: WordProgress | undefined, today: DateKey): p is WordProgress =>
  !!p && p.dueDate <= today

/**
 * Применяет ответ к состоянию слова (правила 1–3 алгоритма Лейтнера).
 * `prev` = undefined означает новое слово.
 */
export function applyAnswer(
  wordId: string,
  prev: WordProgress | undefined,
  know: boolean,
  today: DateKey,
  now: number,
): WordProgress {
  let box: number
  if (!know) box = 1
  else if (!prev) box = 2
  else box = Math.min(prev.box + 1, MAX_BOX)

  return {
    wordId,
    box,
    dueDate: addDays(today, BOX_INTERVALS[box]),
    lastReviewed: today,
    correct: (prev?.correct ?? 0) + (know ? 1 : 0),
    wrong: (prev?.wrong ?? 0) + (know ? 0 : 1),
    updatedAt: now,
    deletedAt: null,
  }
}
