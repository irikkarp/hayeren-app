import {
  finishRow,
  isRowError,
  SET_TITLE_TOO_LONG,
  setTitleTooLong,
  type ParseOutput,
  type ParsedRow,
  type RowError,
} from './parsedRows'
import { normalizeText } from './text'
import { hasArmenianLetter, type WordInput } from './wordValidation'

/** Лимиты файла (критерий 71, ред. 3). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_FILE_ROWS = 3000

export type Role = 'hy' | 'ru' | 'translit' | 'exampleHy' | 'exampleRu' | 'set' | 'skip'

/** Роли в порядке выпадающего списка (критерии 74, 101). */
export const ROLES: { role: Role; label: string }[] = [
  { role: 'hy', label: 'Армянское слово' },
  { role: 'ru', label: 'Перевод' },
  { role: 'translit', label: 'Транслитерация' },
  { role: 'exampleHy', label: 'Пример (по-армянски)' },
  { role: 'exampleRu', label: 'Перевод примера' },
  { role: 'set', label: 'Набор' },
  { role: 'skip', label: 'Не импортировать' },
]
export const roleLabel = (role: Role): string => ROLES.find((r) => r.role === role)!.label

/** Названия заголовков для автоопределения (критерии 75, 101). */
const HEADER_NAMES: Record<Exclude<Role, 'skip'>, string[]> = {
  hy: ['hy', 'армянский', 'армянское', 'слово', 'по-армянски', 'armenian', 'հայերեն', 'բառ'],
  ru: ['ru', 'перевод', 'русский', 'по-русски', 'translation', 'russian'],
  translit: ['translit', 'транслитерация', 'transliteration', 'произношение'],
  exampleHy: ['example_hy', 'пример'],
  exampleRu: ['example_ru', 'перевод примера'],
  set: ['set', 'набор'],
}

export interface Mapping {
  hasHeader: boolean
  roles: Role[]
  /** Как определены колонки: по заголовкам или по содержимому. */
  detectedBy: 'headers' | 'content'
}

const headerKey = (s: string) => normalizeText(s).toLowerCase()

function headerRole(cell: string): Role | null {
  const key = headerKey(cell)
  if (key === '') return null
  for (const [role, names] of Object.entries(HEADER_NAMES)) {
    if (names.includes(key)) return role as Role
  }
  return null
}

export const columnCount = (rows: string[][]): number =>
  rows.reduce((max, r) => Math.max(max, r.length), 0)

/**
 * Автоопределение колонок (критерий 75). Сначала по заголовкам первой строки (повторы роли
 * остаются у первой колонки). Если заголовков нет: «Армянское слово» — первая колонка, где
 * армянские буквы есть не менее чем в половине непустых ячеек; «Перевод» — первая из остальных,
 * где армянских букв нет в большинстве; остальное — «Не импортировать».
 */
export function detectMapping(rows: string[][]): Mapping {
  const cols = columnCount(rows)
  const roles: Role[] = Array(cols).fill('skip')
  const first = rows[0] ?? []

  const found = first.map(headerRole)
  if (found.some((r) => r !== null)) {
    const used = new Set<Role>()
    found.forEach((role, c) => {
      if (role && !used.has(role)) {
        roles[c] = role
        used.add(role)
      }
    })
    return { hasHeader: true, roles, detectedBy: 'headers' }
  }

  const stats = Array.from({ length: cols }, (_, c) => {
    const cells = rows.map((r) => (r[c] ?? '').trim()).filter((v) => v !== '')
    const armenian = cells.filter(hasArmenianLetter).length
    // Колонки с одними номерами и цифрами переводом не считаются.
    const texty = cells.filter((v) => /\p{L}/u.test(v)).length
    return { filled: cells.length, armenian, texty }
  })
  const hyCol = stats.findIndex((s) => s.filled > 0 && s.armenian * 2 >= s.filled)
  if (hyCol >= 0) roles[hyCol] = 'hy'
  const ruCol = stats.findIndex(
    (s, c) =>
      c !== hyCol &&
      s.filled > 0 &&
      (s.filled - s.armenian) * 2 > s.filled &&
      s.texty * 2 >= s.filled,
  )
  if (ruCol >= 0) roles[ruCol] = 'ru'
  return { hasHeader: false, roles, detectedBy: 'content' }
}

/** Что мешает перейти «Далее» (критерий 76): список причин, пустой — можно. */
export function mappingProblems(roles: readonly Role[]): string[] {
  const problems: string[] = []
  const count = (r: Role) => roles.filter((x) => x === r).length
  if (count('hy') === 0) problems.push('Выберите колонку для «Армянское слово»')
  if (count('ru') === 0) problems.push('Выберите колонку для «Перевод»')
  for (const { role, label } of ROLES) {
    if (role !== 'skip' && count(role) > 1) {
      problems.push(`Роль «${label}» назначена нескольким колонкам — оставьте одну`)
    }
  }
  return problems
}

/**
 * При импорте из значения, которое начинается с одного или нескольких `'` и дальше с
 * `= + - @`, удаляется один первый апостроф (критерий 95: защита от формул при экспорте).
 */
export function unprotectFormula(value: string): string {
  return /^'+[=+\-@]/.test(value) ? value.slice(1) : value
}

/** Число строк данных: все строки без заголовка (хвостовые пустые уже отброшены). */
export const dataRowCount = (rows: string[][], hasHeader: boolean): number =>
  Math.max(0, rows.length - (hasHeader ? 1 : 0))

export function tooManyRowsMessage(n: number): string {
  return `В файле ${n} строк, максимум ${MAX_FILE_ROWS}. Разделите файл на части.`
}

/**
 * Применяет сопоставление колонок к таблице (критерии 77–78, 102). Номер строки — номер в файле
 * (как в Excel, с учётом заголовка). Строки, где все сопоставленные ячейки пусты, пропускаются.
 */
export function applyMapping(
  rows: string[][],
  roles: readonly Role[],
  hasHeader: boolean,
): ParseOutput {
  const out: ParseOutput = { rows: [], errors: [], skipped: 0 }
  const mapped = roles.map((r, c) => [r, c] as const).filter(([r]) => r !== 'skip')
  for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
    const line = i + 1
    const cells = Object.fromEntries(
      mapped.map(([role, c]) => [role, normalizeText(unprotectFormula(rows[i][c] ?? ''))]),
    ) as Partial<Record<Role, string>>
    if (mapped.every(([role]) => !cells[role])) {
      out.skipped++
      continue
    }
    const raw = mapped.map(([, c]) => rows[i][c] ?? '').join(' | ')
    const fail = (reason: string): RowError => ({ line, raw, reason })
    let result: ParsedRow | RowError
    if (!cells.hy) result = fail('Нет армянского слова')
    else if (!cells.ru) result = fail('Нет перевода')
    else if (cells.set && setTitleTooLong(cells.set)) result = fail(SET_TITLE_TOO_LONG)
    else {
      const input: WordInput = {
        hy: cells.hy,
        ru: cells.ru,
        translit: cells.translit ?? '',
        exampleHy: cells.exampleHy ?? '',
        exampleRu: cells.exampleRu ?? '',
      }
      result = finishRow(line, raw, input, cells.set || null)
    }
    if (isRowError(result)) out.errors.push(result)
    else out.rows.push(result)
  }
  return out
}
