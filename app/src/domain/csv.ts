/** Разбор CSV (критерий 72): UTF-8 с BOM или без, разделитель определяется сам, RFC 4180. */

export type Delimiter = ',' | ';' | '\t'
const DELIMITERS: Delimiter[] = [';', '\t', ',']

export const NOT_UTF8_MESSAGE =
  'Файл не в кодировке UTF-8. В Excel выберите «Файл → Сохранить как → CSV UTF-8».'

/**
 * Строгое декодирование UTF-8: null, если байты не являются корректным UTF-8 (например,
 * Windows-1251). BOM в начале отбрасывается.
 */
export function decodeUtf8(bytes: ArrayBuffer | Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  } catch {
    return null
  }
}

const UNCLOSED = '\u0000'

/**
 * Разбирает CSV в строки полей. Значения в кавычках могут содержать разделители и переводы
 * строк; `""` внутри кавычек — одна кавычка. Пустые строки сохраняются как `['']`, чтобы номера
 * строк совпадали с номерами в Excel. Хвостовые пустые строки отбрасываются.
 * Непарная кавычка не склеивает остаток файла: она считается обычным символом, а номер строки
 * первой такой кавычки возвращается в `unclosedAt` (null — все кавычки парные).
 */
export function parseCsvDetailed(
  text: string,
  delimiter: Delimiter,
): { rows: string[][]; unclosedAt: number | null } {
  let unclosedAt: number | null = null
  let source = text
  for (;;) {
    const res = parseOnce(source, delimiter)
    if (res.openAt === null) {
      const rows = res.rows.map((r) => r.map((c) => c.replaceAll(UNCLOSED, '"')))
      return { rows, unclosedAt }
    }
    unclosedAt ??= res.openRow
    source = source.slice(0, res.openAt) + UNCLOSED + source.slice(res.openAt + 1)
  }
}

export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  return parseCsvDetailed(text, delimiter).rows
}

function parseOnce(text: string, delimiter: Delimiter) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let afterQuote = false // только что закрылась кавычка
  let quoteAt = -1
  let quoteRow = 0
  const endField = () => {
    row.push(field)
    field = ''
    afterQuote = false
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
          afterQuote = true
        }
      } else field += ch
    } else if (ch === '"' && field === '' && !afterQuote) {
      quoted = true
      quoteAt = i
      quoteRow = rows.length + 1
    } else if (ch === delimiter) {
      endField()
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRow()
    } else {
      field += ch
      afterQuote = false
    }
  }
  if (quoted) return { rows, openAt: quoteAt, openRow: quoteRow }
  if (field !== '' || row.length > 0 || afterQuote) endRow()
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop()
  return { rows, openAt: null as number | null, openRow: 0 }
}

/**
 * Определяет разделитель по первым строкам: подходят те, что дают одинаковое число колонок
 * (не меньше двух) во всех проверенных строках; из них берётся первый по приоритету `;`,
 * табуляция, `,` (запятые часто встречаются внутри значений). Если согласованного нет, берётся
 * тот, что даёт больше колонок в первой строке; если колонок нет вовсе — `,`.
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.slice(0, 20000)
  let fallback: { d: Delimiter; cols: number } | null = null
  for (const d of DELIMITERS) {
    let parsed = parseCsv(sample, d)
    if (text.length > sample.length) parsed = parsed.slice(0, -1) // последняя строка могла оборваться
    const rows = parsed.slice(0, 10).filter((r) => r.some((c) => c.trim() !== ''))
    if (rows.length === 0) continue
    const first = rows[0].length
    if (first < 2) continue
    if (rows.every((r) => r.length === first)) return d
    if (!fallback || first > fallback.cols) fallback = { d, cols: first }
  }
  return fallback ? fallback.d : ','
}

export interface CsvTable {
  rows: string[][]
  delimiter: Delimiter
  /** Номер строки первой непарной кавычки или null. */
  unclosedAt: number | null
}

/** Текст CSV → строки таблицы; `delimiter` null — определить автоматически. */
export function parseCsvAuto(text: string, delimiter: Delimiter | null = null): CsvTable {
  const d = delimiter ?? detectDelimiter(text)
  return { ...parseCsvDetailed(text, d), delimiter: d }
}
