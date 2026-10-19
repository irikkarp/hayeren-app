import { describe, expect, it } from 'vitest'
import { prog, progressMap } from '../test/fixtures'
import {
  answer,
  createSession,
  dropMissing,
  feedbackText,
  sessionProgress,
  sessionStats,
} from './session'

const TODAY = '2026-10-19'

describe('итоги сессии (критерий 21)', () => {
  it('«Пройдено / Знаю / Не знаю» считают слова, а не показы', () => {
    let progress = progressMap()
    let s = createSession([
      { wordId: 'a-01', kind: 'new' },
      { wordId: 'a-02', kind: 'new' },
      { wordId: 'a-03', kind: 'new' },
    ])
    const steps = ['know', 'dont', 'know', 'know'] as const // 4-й ответ — на повтор a-02
    for (const verdict of steps) {
      const out = answer(s, verdict, { progress, today: TODAY, now: 1 })
      if (out.update) progress = { ...progress, [out.update.progress.wordId]: out.update.progress }
      s = out.session
    }
    expect(sessionStats(s)).toEqual({ passed: 3, know: 2, dont: 1 })
    expect(sessionProgress(s)).toEqual({ done: 4, total: 4, left: 0 })
  })

  it('выбывшие слова пропускаются (критерий 82)', () => {
    const s = createSession([
      { wordId: 'a-01', kind: 'review' },
      { wordId: 'a-02', kind: 'review' },
    ])
    const next = dropMissing(s, new Set(['a-02']))
    expect(next.queue.map((i) => i.wordId)).toEqual(['a-02'])
    expect(dropMissing(next, new Set(['a-02']))).toBe(next)
  })

  it('ответ в пустой сессии — ошибка', () => {
    expect(() =>
      answer(createSession([]), 'know', { progress: {}, today: TODAY, now: 1 }),
    ).toThrow()
  })

  it('prevBox: для нового слова null, для повторения — прежняя коробка', () => {
    const progress = progressMap(prog('a-01', 3, TODAY))
    const out = answer(createSession([{ wordId: 'a-01', kind: 'review' }]), 'know', {
      progress,
      today: TODAY,
      now: 1,
    })
    expect(out.update).toMatchObject({ wasNew: false, prevBox: 3 })
    expect(out.update?.progress.box).toBe(4)
  })
})

describe('тексты тоста после ответа', () => {
  it('интервалы', () => {
    expect(feedbackText({ type: 'know', days: 1 })).toBe('Знаю · вернёмся к слову завтра')
    expect(feedbackText({ type: 'know', days: 2 })).toBe('Знаю · вернёмся к слову через 2 дня')
    expect(feedbackText({ type: 'know', days: 4 })).toBe('Знаю · вернёмся к слову через 4 дня')
    expect(feedbackText({ type: 'know', days: 8 })).toBe('Знаю · вернёмся к слову через 8 дней')
    expect(feedbackText({ type: 'know', days: 16 })).toBe('Знаю · вернёмся к слову через 16 дней')
  })

  it('«Не знаю» и повторный показ', () => {
    expect(feedbackText({ type: 'dont-first' })).toBe('Не знаю · покажем ещё раз в конце')
    expect(feedbackText({ type: 'again', know: true })).toBe('Знаю · слово вернётся завтра')
    expect(feedbackText({ type: 'again', know: false })).toBe('Не знаю · слово вернётся завтра')
  })
})
