import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { streakView } from './streak'
import { computeStreak } from './stats'
import type { DayMap, DayStats } from './types'

const TODAY = '2026-10-19'

function days(...offsets: number[]): DayMap {
  const out: DayMap = {}
  for (const off of offsets) {
    const date = addDays(TODAY, off)
    const d: DayStats = {
      date,
      answered: 3,
      newStarted: 0,
      bonusNew: 0,
      updatedAt: 0,
      deletedAt: null,
    }
    out[date] = d
  }
  return out
}

describe('серия дней (критерии 24–26, 142–144)', () => {
  it('нет ответов — 0', () => {
    expect(computeStreak({}, TODAY)).toBe(0)
  })

  it('24/142: вчера был ответ, сегодня нет — серия сохраняется', () => {
    expect(computeStreak(days(-1, -2, -3), TODAY)).toBe(3)
  })

  it('25/143: последний ответ позавчера или раньше — 0', () => {
    expect(computeStreak(days(-2, -3), TODAY)).toBe(0)
    expect(computeStreak(days(-10), TODAY)).toBe(0)
  })

  it('26/144: первый ответ сегодня увеличивает серию на 1; ещё ответы в тот же день — нет', () => {
    const before = days(-1, -2, -3)
    expect(computeStreak(before, TODAY)).toBe(3)
    const after = { ...before, ...days(0) }
    expect(computeStreak(after, TODAY)).toBe(4)
    after[TODAY] = { ...after[TODAY], answered: 30 }
    expect(computeStreak(after, TODAY)).toBe(4)
  })

  it('первый ответ при серии 0 — серия 1', () => {
    expect(computeStreak(days(0), TODAY)).toBe(1)
    expect(computeStreak(days(0, -5), TODAY)).toBe(1)
  })

  it('пропуск дня обрывает серию', () => {
    expect(computeStreak(days(0, -1, -3, -4), TODAY)).toBe(2)
  })

  it('день без ответов (только поднят лимит новых) не продлевает серию', () => {
    const map = days(-1)
    map[TODAY] = { ...map[addDays(TODAY, -1)], date: TODAY, answered: 0, bonusNew: 10 }
    expect(computeStreak(map, TODAY)).toBe(1)
  })

  it('удалённые (сброшенные) дни не считаются', () => {
    const map = days(0, -1)
    map[TODAY] = { ...map[TODAY], deletedAt: 1 }
    map[addDays(TODAY, -1)] = { ...map[addDays(TODAY, -1)], deletedAt: 1 }
    expect(computeStreak(map, TODAY)).toBe(0)
  })

  it('через границу месяца и года', () => {
    const map: DayMap = {}
    for (const date of ['2026-12-30', '2026-12-31', '2027-01-01']) {
      map[date] = { date, answered: 1, newStarted: 0, bonusNew: 0, updatedAt: 0, deletedAt: null }
    }
    expect(computeStreak(map, '2027-01-01')).toBe(3)
    expect(computeStreak(map, '2027-01-02')).toBe(3)
    expect(computeStreak(map, '2027-01-03')).toBe(0)
  })
})

describe('streakView (критерии 139–141, 147, 148а)', () => {
  it('число закрашенных ячеек и признак «спелый»', () => {
    const filled = [0, 1, 2, 3, 4, 5, 6, 30, 100].map((d) => streakView(d).filled)
    expect(filled).toEqual([0, 1, 2, 3, 4, 5, 5, 5, 5])
    const ripe = [0, 1, 4, 5, 6, 100].map((d) => streakView(d).ripe)
    expect(ripe).toEqual([false, false, false, true, true, true])
  })

  it('K — сколько дней до спелого', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((d) => streakView(d).remaining)).toEqual([5, 4, 3, 2, 1, 0, 0])
  })

  it('следующая ячейка со штриховым контуром', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => streakView(d).next)).toEqual([
      1,
      2,
      3,
      4,
      5,
      null,
      null,
    ])
  })

  it('тексты', () => {
    expect(streakView(0)).toMatchObject({
      title: 'Начните серию сегодня',
      sub: 'Ответьте на любую карточку, и вырастет первый гранат',
      ariaLabel: 'Серии нет. Ответьте на любую карточку, и вырастет первый гранат',
    })
    expect(streakView(1)).toMatchObject({
      title: '1 день подряд',
      sub: 'Гранат растёт: до спелого 4 дня',
      ariaLabel: 'Серия: 1 день подряд. Гранат растёт, до спелого 4 дня',
    })
    expect(streakView(3)).toMatchObject({
      title: '3 дня подряд',
      sub: 'Гранат растёт: до спелого 2 дня',
    })
    expect(streakView(4).sub).toBe('Гранат растёт: до спелого 1 день')
    expect(streakView(5)).toMatchObject({
      title: '5 дней подряд',
      sub: 'Гранат созрел',
      ariaLabel: 'Серия: 5 дней подряд. Гранат созрел',
    })
    expect(streakView(7).title).toBe('7 дней подряд')
    expect(streakView(21).title).toBe('21 день подряд')
  })
})
