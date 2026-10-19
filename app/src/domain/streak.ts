import { daysWord } from './plural'

export const RIPE_DAYS = 5

export interface StreakView {
  /** Сколько ячеек-гранатов закрашено (0–5). */
  filled: number
  /** Номер ячейки со штриховым контуром (1–5) или null, если гранат созрел. */
  next: number | null
  ripe: boolean
  /** Сколько дней до спелого граната (0, если созрел). */
  remaining: number
  title: string
  sub: string
  ariaLabel: string
}

/** Как показать серию d гранатами (критерии 139–141, 147). Сам расчёт серии — computeStreak. */
export function streakView(d: number): StreakView {
  const filled = Math.min(Math.max(d, 0), RIPE_DAYS)
  const ripe = d >= RIPE_DAYS
  const remaining = ripe ? 0 : RIPE_DAYS - Math.max(d, 0)
  const next = ripe ? null : filled + 1
  if (d <= 0) {
    const sub = 'Ответьте на любую карточку, и вырастет первый гранат'
    return {
      filled: 0,
      next,
      ripe: false,
      remaining,
      title: 'Начните серию сегодня',
      sub,
      ariaLabel: `Серии нет. ${sub}`,
    }
  }
  const title = `${d} ${daysWord(d)} подряд`
  if (ripe) {
    return {
      filled,
      next,
      ripe,
      remaining,
      title,
      sub: 'Гранат созрел',
      ariaLabel: `Серия: ${title}. Гранат созрел`,
    }
  }
  const left = `${remaining} ${daysWord(remaining)}`
  return {
    filled,
    next,
    ripe,
    remaining,
    title,
    sub: `Гранат растёт: до спелого ${left}`,
    ariaLabel: `Серия: ${title}. Гранат растёт, до спелого ${left}`,
  }
}
