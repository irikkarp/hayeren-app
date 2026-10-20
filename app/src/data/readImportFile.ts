import { decodeUtf8, NOT_UTF8_MESSAGE, parseCsvAuto, type Delimiter } from '../domain/csv'
import {
  dataRowCount,
  detectMapping,
  MAX_FILE_BYTES,
  MAX_FILE_ROWS,
  tooManyRowsMessage,
} from '../domain/importFile'
import type { ImportedFile } from '../store/appStore'

export const FILE_ERRORS = {
  format:
    'Поддерживаются файлы CSV и Excel (.xlsx). Старый формат .xls пересохраните в Excel как .xlsx.',
  size: 'Файл больше 5 МБ',
  unreadable: 'Не удалось открыть файл. Проверьте, что он не защищён паролем',
  empty: 'В файле нет данных',
} as const

export const unclosedQuoteMessage = (row: number) =>
  `В строке ${row} не закрыта кавычка. Исправьте файл и загрузите его снова.`

export type ReadResult = { ok: true; file: ImportedFile } | { ok: false; error: string }

type Cell = string | number | boolean | Date | null | undefined

function cellText(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

/** Отбрасывает пустые строки в конце (как это делает Excel при показе используемого диапазона). */
function trimTrailingEmpty(rows: string[][]): string[][] {
  let end = rows.length
  while (end > 0 && rows[end - 1].every((c) => c.trim() === '')) end--
  return rows.slice(0, end)
}

/**
 * Читает файл импорта (критерии 71–73, 84): `.csv` (UTF-8, разделитель определяется сам) или
 * `.xlsx` (первый лист, значения формул — результат). Библиотека для xlsx подгружается только
 * здесь, на экране импорта. Всё выполняется на устройстве, данные никуда не отправляются.
 */
export async function readImportFile(file: File): Promise<ReadResult> {
  const name = file.name
  const ext = name.toLowerCase().split('.').pop()
  if (ext !== 'csv' && ext !== 'xlsx') return { ok: false, error: FILE_ERRORS.format }
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: FILE_ERRORS.size }

  let rows: string[][]
  let sheetName: string | null = null
  let multiSheet = false
  let csvText: string | null = null
  let delimiter: Delimiter | null = null
  try {
    const buffer = await file.arrayBuffer()
    if (ext === 'csv') {
      const text = decodeUtf8(buffer)
      if (text === null) return { ok: false, error: NOT_UTF8_MESSAGE }
      const table = parseCsvAuto(text)
      if (table.unclosedAt !== null) {
        return { ok: false, error: unclosedQuoteMessage(table.unclosedAt) }
      }
      rows = table.rows
      csvText = text
      delimiter = table.delimiter
    } else {
      const { default: readXlsx } = await import('read-excel-file/browser')
      const sheets = await readXlsx(buffer)
      sheetName = sheets[0]?.sheet ?? null
      multiSheet = sheets.length > 1
      rows = (sheets[0]?.data ?? []).map((r) => r.map((c) => cellText(c as Cell)))
    }
  } catch {
    return { ok: false, error: FILE_ERRORS.unreadable }
  }

  rows = trimTrailingEmpty(rows)
  if (rows.length === 0) return { ok: false, error: FILE_ERRORS.empty }
  const data = dataRowCount(rows, detectMapping(rows).hasHeader)
  if (data > MAX_FILE_ROWS) return { ok: false, error: tooManyRowsMessage(data) }
  return { ok: true, file: { name, sheetName, multiSheet, rows, csvText, delimiter } }
}

export type DelimiterChoice = 'auto' | Delimiter

/**
 * Перечитывает CSV с другим разделителем (S14). Возвращает новую таблицу или ошибку (непарная
 * кавычка, пустой файл). `choice` 'auto' — определить заново.
 */
export function rereadCsv(
  csvText: string,
  choice: DelimiterChoice,
): { ok: true; rows: string[][]; delimiter: Delimiter } | { ok: false; error: string } {
  const table = parseCsvAuto(csvText, choice === 'auto' ? null : choice)
  if (table.unclosedAt !== null) return { ok: false, error: unclosedQuoteMessage(table.unclosedAt) }
  const rows = trimTrailingEmpty(table.rows)
  if (rows.length === 0) return { ok: false, error: FILE_ERRORS.empty }
  return { ok: true, rows, delimiter: table.delimiter }
}
