/** Экспорт своих слов в CSV (этап 3, критерии 88–100): чистые функции, без обращения к браузеру. */
import { toDateKey } from './dates'
import type { UserSet, UserWord } from './types'

export const BOM = '﻿'
export const EXPORT_DELIMITER = ';'
export const EOL = '\r\n'
/** Заголовки колонок (критерий 93). */
export const EXPORT_HEADERS = ['set', 'hy', 'ru', 'translit', 'example_hy', 'example_ru'] as const

/**
 * Защита от формул (критерий 95): значение, которое после нуля или нескольких `'` начинается с
 * `= + - @`, получает ещё один ведущий апостроф. Обратное действие делает `unprotectFormula`
 * при импорте.
 */
export function protectFormula(value: string): string {
  return /^'*[=+\-@]/.test(value) ? `'${value}` : value
}

/** Одно значение CSV (RFC 4180): кавычки, если есть `;`, `,`, `"` или перевод строки. */
export function csvField(value: string): string {
  return /[;,"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** Строка CSV из значений (без перевода строки в конце). */
export const csvRow = (values: readonly string[]): string =>
  values.map((v) => csvField(protectFormula(v))).join(EXPORT_DELIMITER)

export interface ExportSelection {
  /** Наборы в порядке экспорта (по дате создания) и их слова в порядке добавления. */
  groups: { set: UserSet; words: UserWord[] }[]
  wordCount: number
  setCount: number
}

/**
 * Что попадёт в файл (критерии 90–91): живые наборы по дате создания, внутри слова в порядке
 * добавления; наборы без слов пропускаются. `setId` — выгрузить только один набор.
 */
export function selectForExport(
  sets: readonly UserSet[],
  words: readonly UserWord[],
  setId?: string,
): ExportSelection {
  const live = (r: { deletedAt: number | null }) => r.deletedAt == null
  const bySet = new Map<string, UserWord[]>()
  for (const w of words.filter(live).sort((a, b) => a.createdAt - b.createdAt)) {
    bySet.set(w.setId, [...(bySet.get(w.setId) ?? []), w])
  }
  const groups = sets
    .filter(live)
    .filter((s) => setId === undefined || s.id === setId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((set) => ({ set, words: bySet.get(set.id) ?? [] }))
    .filter((g) => g.words.length > 0)
  return {
    groups,
    wordCount: groups.reduce((n, g) => n + g.words.length, 0),
    setCount: groups.length,
  }
}

/**
 * Текст файла (критерии 92–95): BOM, заголовки, затем по строке на слово. `translit` пуст у слов
 * с автоматической транслитерацией; остальные значения выгружаются как хранятся.
 */
export function buildCsv(selection: ExportSelection): string {
  const lines: string[] = [csvRow(EXPORT_HEADERS)]
  for (const { set, words } of selection.groups) {
    for (const w of words) {
      lines.push(
        csvRow([set.title, w.hy, w.ru, w.translitAuto ? '' : w.translit, w.exampleHy, w.exampleRu]),
      )
    }
  }
  return BOM + lines.join(EOL) + EOL
}

const MAX_TITLE_IN_NAME = 50

/** Название набора для имени файла (критерий 96): запрещённые символы → `_`, не больше 50 символов. */
export function fileNameTitle(title: string): string {
  return Array.from(title.replace(/[\\/:*?"<>|\r\n]/g, '_'))
    .slice(0, MAX_TITLE_IN_NAME)
    .join('')
}

/** `hayeren-words-ГГГГ-ММ-ДД.csv` или `hayeren-words-<набор>-ГГГГ-ММ-ДД.csv`, дата локальная. */
export function exportFileName(date: Date, setTitle?: string): string {
  const day = toDateKey(date)
  return setTitle === undefined
    ? `hayeren-words-${day}.csv`
    : `hayeren-words-${fileNameTitle(setTitle)}-${day}.csv`
}

export interface ExportFile {
  fileName: string
  text: string
  wordCount: number
  setCount: number
}

/** Готовый файл экспорта или null, если выгружать нечего (критерий 89). */
export function buildExportFile(
  sets: readonly UserSet[],
  words: readonly UserWord[],
  now: Date,
  setId?: string,
): ExportFile | null {
  const selection = selectForExport(sets, words, setId)
  if (selection.wordCount === 0) return null
  const title = setId === undefined ? undefined : selection.groups[0].set.title
  return {
    fileName: exportFileName(now, title),
    text: buildCsv(selection),
    wordCount: selection.wordCount,
    setCount: selection.setCount,
  }
}

/** Дата последней копии для интерфейса: ДД.ММ.ГГГГ по локальному времени. */
export function formatBackupDate(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

export const EXPORT_NOTE =
  'В файл попадут наборы, слова, переводы, транслитерация и примеры. Прогресс повторения (что вы уже выучили) не сохраняется: после загрузки файла все слова будут новыми.'
export const NOTHING_TO_EXPORT = 'Пока нечего экспортировать: добавьте свои слова'
export const SET_EMPTY = 'В наборе нет слов'
export const EXPORT_FAILED = 'Не удалось создать файл. Попробуйте ещё раз'
/** Короткое сообщение об успешном экспорте (подробности и имя файла не показываются). */
export const EXPORT_DONE = 'Файл сохранён. Прогресс в файл не входит.'
