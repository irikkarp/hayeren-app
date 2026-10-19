// Даты «сегодня» считаются по локальному времени устройства. Календарный день хранится как
// строка 'ГГГГ-ММ-ДД' (DateKey): её удобно сравнивать, хранить и передавать на сервер.
export type DateKey = string

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

export function toDateKey(d: Date): DateKey {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parts(key: DateKey): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number)
  return [y, m, d]
}

/** Прибавляет n календарных дней (n может быть отрицательным). Устойчиво к переводу часов. */
export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = parts(key)
  return toDateKey(new Date(y, m - 1, d + n))
}

/** Сколько календарных дней от `from` до `to` (положительное, если `to` позже). */
export function daysBetween(from: DateKey, to: DateKey): number {
  const [y1, m1, d1] = parts(from)
  const [y2, m2, d2] = parts(to)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}
