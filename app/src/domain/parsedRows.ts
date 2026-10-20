import { transliterate } from './translit'
import {
  firstError,
  LIMITS,
  normalizeWordInput,
  validateWordInput,
  type WordInput,
} from './wordValidation'

/** Распознанная строка (вставка или файл) после нормализации и проверки полей. */
export interface ParsedRow {
  /** Номер строки: в тексте для вставки, в файле (как в Excel) для импорта. */
  line: number
  hy: string
  ru: string
  /** Транслитерация, введённая пользователем; пусто — будет создана автоматически. */
  translit: string
  exampleHy: string
  exampleRu: string
  /** Название набора из колонки «Набор» (критерий 101); null — колонки или значения нет. */
  setTitle: string | null
}

export interface RowError {
  line: number
  /** Исходный текст строки (для файла — значения ячеек через « | »). */
  raw: string
  reason: string
}

/** Результат разбора вставки или файла (критерий 63). */
export interface ParseOutput {
  rows: ParsedRow[]
  errors: RowError[]
  /** Пустых строк пропущено. */
  skipped: number
}

export const emptyInput = (): WordInput => ({
  hy: '',
  ru: '',
  translit: '',
  exampleHy: '',
  exampleRu: '',
})

/** Нормализует поля строки и проверяет их по критериям 45–51: готовая строка или причина ошибки. */
export function finishRow(
  line: number,
  raw: string,
  input: WordInput,
  setTitle: string | null = null,
): ParsedRow | RowError {
  const fields = normalizeWordInput(input)
  const reason = firstError(validateWordInput(fields))
  if (reason) return { line, raw, reason }
  return { line, ...fields, setTitle }
}

export const isRowError = (r: ParsedRow | RowError): r is RowError => 'reason' in r

/** Транслитерация слова: введённая или созданная автоматически (критерий 52). */
export function wordTranslit(row: { hy: string; translit: string }): {
  translit: string
  auto: boolean
} {
  return row.translit !== ''
    ? { translit: row.translit, auto: false }
    : { translit: transliterate(row.hy), auto: true }
}

/** Ошибка названия набора из колонки (критерий 102). */
export const SET_TITLE_TOO_LONG = 'Название набора длиннее 50 символов'
export const setTitleTooLong = (title: string): boolean =>
  Array.from(title).length > LIMITS.setTitle
