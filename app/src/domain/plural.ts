/** Индекс формы по русским правилам: 0 — «день», 1 — «дня», 2 — «дней». */
export function pluralIndex(n: number): 0 | 1 | 2 {
  const abs = Math.abs(Math.trunc(n))
  const m100 = abs % 100
  if (m100 >= 11 && m100 <= 14) return 2
  const m10 = abs % 10
  if (m10 === 1) return 0
  if (m10 >= 2 && m10 <= 4) return 1
  return 2
}

export function plural(n: number, forms: readonly [string, string, string]): string {
  return forms[pluralIndex(n)]
}

export const daysWord = (n: number) => plural(n, ['день', 'дня', 'дней'])
export const wordsWord = (n: number) => plural(n, ['слово', 'слова', 'слов'])
export const setsWord = (n: number) => plural(n, ['набор', 'набора', 'наборов'])
export const rowsWord = (n: number) => plural(n, ['строка', 'строки', 'строк'])
