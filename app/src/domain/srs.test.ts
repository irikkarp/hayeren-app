import { describe, expect, it } from 'vitest'
import { prog } from '../test/fixtures'
import { applyAnswer, BOX_INTERVALS, isDue, isLearned } from './srs'

const TODAY = '2026-10-19'
const NOW = 1_700_000_000_000

describe('applyAnswer (критерии 15–19, 22)', () => {
  it('15: новое слово, «Знаю» → коробка 2, срок через 2 дня', () => {
    const p = applyAnswer('w', undefined, true, TODAY, NOW)
    expect(p).toMatchObject({ wordId: 'w', box: 2, dueDate: '2026-10-21', correct: 1, wrong: 0 })
    expect(p.lastReviewed).toBe(TODAY)
    expect(p.updatedAt).toBe(NOW)
    expect(p.deletedAt).toBeNull()
  })

  it('новое слово, «Не знаю» → коробка 1, завтра', () => {
    const p = applyAnswer('w', undefined, false, TODAY, NOW)
    expect(p).toMatchObject({ box: 1, dueDate: '2026-10-20', correct: 0, wrong: 1 })
  })

  it('16: «Знаю» в коробке b даёт b+1 и интервал по таблице 2/4/8/16', () => {
    const expected: [number, number, string][] = [
      [1, 2, '2026-10-21'],
      [2, 3, '2026-10-23'],
      [3, 4, '2026-10-27'],
      [4, 5, '2026-11-04'],
    ]
    for (const [b, box, due] of expected) {
      const p = applyAnswer('w', prog('w', b, TODAY), true, TODAY, NOW)
      expect({ box: p.box, due: p.dueDate }).toEqual({ box, due })
    }
  })

  it('17: коробка 5 остаётся 5, срок +16 дней', () => {
    const p = applyAnswer('w', prog('w', 5, TODAY), true, TODAY, NOW)
    expect(p.box).toBe(5)
    expect(p.dueDate).toBe('2026-11-04')
  })

  it('18: «Не знаю» в любой коробке → коробка 1, завтра', () => {
    for (const b of [1, 2, 3, 4, 5]) {
      const p = applyAnswer('w', prog('w', b, TODAY), false, TODAY, NOW)
      expect(p).toMatchObject({ box: 1, dueDate: '2026-10-20' })
    }
  })

  it('счётчики накапливаются', () => {
    const p = applyAnswer('w', prog('w', 2, TODAY, { correct: 3, wrong: 1 }), true, TODAY, NOW)
    expect(p).toMatchObject({ correct: 4, wrong: 1 })
  })

  it('граница суток и года: срок считается от сегодняшней локальной даты', () => {
    expect(applyAnswer('w', prog('w', 4, '2026-12-31'), true, '2026-12-31', NOW).dueDate).toBe(
      '2027-01-16',
    )
    expect(applyAnswer('w', undefined, false, '2026-12-31', NOW).dueDate).toBe('2027-01-01')
  })

  it('таблица интервалов', () => {
    expect(BOX_INTERVALS).toEqual({ 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 })
  })
})

describe('isDue / isLearned (правила 4–5)', () => {
  it('срок сегодня — к повторению, завтра — нет, просрочка — да', () => {
    expect(isDue(prog('w', 2, '2026-10-19'), TODAY)).toBe(true)
    expect(isDue(prog('w', 2, '2026-10-20'), TODAY)).toBe(false)
    expect(isDue(prog('w', 2, '2026-09-01'), TODAY)).toBe(true)
    expect(isDue(undefined, TODAY)).toBe(false)
  })

  it('выучено при коробке ≥ 4', () => {
    expect([1, 2, 3, 4, 5].map((b) => isLearned(prog('w', b, TODAY)))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ])
    expect(isLearned(undefined)).toBe(false)
  })
})
