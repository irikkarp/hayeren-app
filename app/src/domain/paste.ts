import {
  finishRow,
  isRowError,
  type ParseOutput,
  type ParsedRow,
  type RowError,
} from './parsedRows'
import { hasArmenianLetter } from './wordValidation'

/** Не больше 500 непустых строк во вставке (критерий 58). */
export const MAX_PASTE_LINES = 500

export const PASTE_ERRORS = {
  noSeparator: 'Не найден разделитель: используйте тире, табуляцию или точку с запятой',
  bothArmenian: 'Не понятно, где армянское слово: армянские буквы есть в обеих частях',
  noArmenian: 'Не понятно, где армянское слово: армянских букв нет ни в одной части',
  noRu: 'Нет перевода',
  tooManyParts: 'Слишком много частей: ожидается 2 или 3',
} as const

const splitLines = (text: string): string[] => text.split(/\r\n|\r|\n/)

/** Сколько в тексте непустых строк (для проверки лимита до разбора). */
export function countPasteLines(text: string): number {
  return splitLines(text).filter((l) => l.trim() !== '').length
}

export function pasteTooLongMessage(count: number): string {
  return `Слишком длинный список: ${count} строк, максимум ${MAX_PASTE_LINES}. Разделите его на части.`
}

/** Убирает нумерацию («1.», «1)», «12.») и маркеры списка («•», «*», «- » с пробелом). */
export function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:\d+[.)]|[•*]|-(?=\s))\s*/, '')
}

/**
 * Делит строку на части (критерий 60). Порядок:
 * 1. табуляция (все части);
 * 2. первое тире с пробелами вокруг (`—`, `–` или `-`): ровно две части, всё справа — перевод
 *    целиком (в нём допустимы `;` и другие тире), транслитерации через тире нет;
 * 3. точка с запятой (все части);
 * 4. длинное тире `—`/`–` без пробелов («կաթ–молоко»), низший приоритет (решение контролёра).
 * Дефис без пробелов («по-русски») разделителем не считается. null — разделителя нет.
 */
export function splitParts(line: string): string[] | null {
  if (line.includes('\t')) return line.split('\t').map((p) => p.trim())
  const spaced = /\s+[—–-]\s+/.exec(line)
  if (spaced)
    return [line.slice(0, spaced.index).trim(), line.slice(spaced.index + spaced[0].length).trim()]
  if (line.includes(';')) return line.split(';').map((p) => p.trim())
  const long = /\s*[—–]\s*/.exec(line)
  if (long)
    return [line.slice(0, long.index).trim(), line.slice(long.index + long[0].length).trim()]
  return null
}

/** Разбор одной строки (без нумерации) в слово или ошибку; критерии 61–62. */
function parseLine(line: number, raw: string, body: string): ParsedRow | RowError {
  const fail = (reason: string): RowError => ({ line, raw, reason })
  const parts = splitParts(body)
  if (!parts) return fail(PASTE_ERRORS.noSeparator)
  if (parts.length > 3) return fail(PASTE_ERRORS.tooManyParts)

  const [a, b, translit = ''] = parts
  const aHy = hasArmenianLetter(a)
  const bHy = hasArmenianLetter(b)
  if (aHy && bHy) return fail(PASTE_ERRORS.bothArmenian)
  if (!aHy && !bHy) return fail(PASTE_ERRORS.noArmenian)
  const [hy, ru] = aHy ? [a, b] : [b, a]
  if (ru === '') return fail(PASTE_ERRORS.noRu)

  return finishRow(line, raw, { hy, ru, translit, exampleHy: '', exampleRu: '' })
}

/** Разбор вставленного списка (критерии 58–62). Лимит строк проверяется отдельно. */
export function parsePaste(text: string): ParseOutput {
  const rows: ParsedRow[] = []
  const errors: RowError[] = []
  let skipped = 0
  splitLines(text).forEach((raw, i) => {
    if (raw.trim() === '') {
      skipped++
      return
    }
    const result = parseLine(i + 1, raw.trim(), stripListMarker(raw).trim())
    if (isRowError(result)) errors.push(result)
    else rows.push(result)
  })
  return { rows, errors, skipped }
}
