import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, toDateKey } from './dates'

describe('dates', () => {
  it('toDateKey использует локальные компоненты даты', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59, 59))).toBe('2026-01-05')
    expect(toDateKey(new Date(2026, 0, 6, 0, 0, 1))).toBe('2026-01-06')
  })

  it('addDays переходит через границы месяца, года и високосный день', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-10-19', 16)).toBe('2026-11-04')
  })

  it('addDays устойчив к переходу на летнее время (сутки не равны 24 часам)', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
  })

  it('daysBetween', () => {
    expect(daysBetween('2026-10-19', '2026-10-19')).toBe(0)
    expect(daysBetween('2026-10-19', '2026-10-21')).toBe(2)
    expect(daysBetween('2026-10-19', '2026-10-18')).toBe(-1)
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
  })
})
