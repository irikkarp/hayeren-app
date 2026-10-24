import {
  progressParts,
  progressValueText,
  segmentWidths,
  type ProgressCounts,
} from '../domain/progress'

/** Строка прогресса «выучено X · в изучении Y из N»: куски не рвутся, перенос между кусками (ui-kit 6.4). */
export function ProgressLine({ counts }: { counts: ProgressCounts }) {
  const p = progressParts(counts)
  return (
    <span className="pl muted t-small">
      <span className="nw">{p.head}</span>
      {p.learning && (
        <>
          {' · '}
          <span className="nw">{p.learning}</span>
        </>
      )}{' '}
      <span className="nw">{p.tail}</span>
    </span>
  )
}

/**
 * Двухцветный бар темы и набора (ui-kit 6.5a): сплошной сегмент «выучено», штриховой с контуром
 * «в изучении». Нулевого сегмента в разметке нет; для N = 0 бар не рисуется.
 */
export function ProgressBar({ counts, label }: { counts: ProgressCounts; label: string }) {
  if (counts.total === 0) return null
  const w = segmentWidths(counts)
  return (
    <span
      className="progress progress-2"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={counts.total}
      aria-valuenow={counts.learned}
      aria-valuetext={progressValueText(counts)}
      aria-label={label}
    >
      {counts.learned > 0 && <span className="seg-l" style={{ width: `${w.learned}%` }} />}
      {counts.learning > 0 && <span className="seg-i" style={{ width: `${w.learning}%` }} />}
    </span>
  )
}

/** Простая полоса (прогресс сессии): один цвет. */
export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}
