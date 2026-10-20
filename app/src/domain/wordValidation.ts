import { normalizeText } from './text'

/** Лимиты полей своего слова (критерий 51). */
export const LIMITS = {
  hy: 60,
  ru: 100,
  translit: 80,
  example: 200,
  setTitle: 50,
  /** Не больше 100 своих наборов и 3000 своих слов в сумме (критерий 44). */
  sets: 100,
  words: 3000,
} as const

const ARMENIAN_LETTER = /[Ա-Ֆա-և]/
/** Армянские знаки, допустимые в написании: ՞ ՜ ՛ ։ ՝ ՚ */
const ARMENIAN_SIGNS = '՞՜՛։՝՚'
const ALLOWED_EXTRA = new RegExp(`[ \\-0-9,.()${ARMENIAN_SIGNS}]`)
const TRANSLIT_OK = /^[A-Za-z\u0259\u018F' -]+$/
/** Типографские апострофы, которые заменяются на `'` (критерий 49). */
const APOSTROPHES = /[\u2019\u2018\u02BC\u02B9\u2032]/g

/** Недопустимые символы транслитерации (без повторов, в порядке появления). */
export function invalidTranslitChars(s: string): string[] {
  return [...new Set(Array.from(s).filter((ch) => !TRANSLIT_OK.test(ch)))]
}

/** Как показать символ в сообщении: невидимые (управляющие, форматирующие) называются по коду. */
export function describeChar(ch: string): string {
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}\u180E\u3164\u115F\u1160]/u.test(ch)) {
    const code = (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')
    return `невидимый символ (U+${code})`
  }
  return ch
}

export const hasArmenianLetter = (s: string): boolean => ARMENIAN_LETTER.test(s)

/** Недопустимые символы армянского поля (без повторов, в порядке появления). */
export function invalidArmenianChars(s: string): string[] {
  const bad: string[] = []
  for (const ch of s) {
    if (ARMENIAN_LETTER.test(ch) || ALLOWED_EXTRA.test(ch)) continue
    if (!bad.includes(ch)) bad.push(ch)
  }
  return bad
}

export const MESSAGES = {
  noArmenian:
    'Здесь нужно слово армянскими буквами, например բարև. Транслитерацию латиницей можно указать в отдельном поле.',
  badChars: (chars: string[]) =>
    `В армянском слове есть латинские или русские буквы: ${chars.map(describeChar).join(', ')}. Часто это похожие буквы из другой раскладки — наберите их армянскими.`,
  noRu: 'Введите перевод',
  badTranslit: (chars: string[]) =>
    `В транслитерации есть недопустимые символы: ${chars.map(describeChar).join(', ')}. Пишите обычными латинскими буквами без значков, например barev.`,
  tooLong: (max: number) => `Слишком длинно: максимум ${max} символов`,
  exampleFirst: 'Сначала заполните пример на армянском',
} as const

/** Поля слова в том виде, как их вводит пользователь. */
export interface WordInput {
  hy: string
  ru: string
  translit: string
  exampleHy: string
  exampleRu: string
}

export type WordField = keyof WordInput
export type FieldErrors = Partial<Record<WordField, string>>

/** Порядок полей в форме: по нему выбирается «первое поле с ошибкой» (критерий 68). */
export const FIELD_ORDER: WordField[] = ['hy', 'ru', 'translit', 'exampleHy', 'exampleRu']

/** Нормализация всех полей перед проверкой и сохранением (критерий 51): NFC, пробелы. */
export function normalizeWordInput(input: WordInput): WordInput {
  return {
    hy: normalizeText(input.hy),
    ru: normalizeText(input.ru),
    translit: normalizeText(input.translit).replace(APOSTROPHES, "'"),
    exampleHy: normalizeText(input.exampleHy),
    exampleRu: normalizeText(input.exampleRu),
  }
}

const len = (s: string) => Array.from(s).length

/** Проверка армянского поля (правила 45–47, 51). `required` — обязательное ли оно. */
export function validateArmenian(value: string, max: number, required: boolean): string | null {
  if (value === '') return required ? MESSAGES.noArmenian : null
  if (!hasArmenianLetter(value)) return MESSAGES.noArmenian
  const bad = invalidArmenianChars(value)
  if (bad.length > 0) return MESSAGES.badChars(bad)
  if (len(value) > max) return MESSAGES.tooLong(max)
  return null
}

/**
 * Проверка полей слова по критериям 45–51. Ожидает уже нормализованные значения
 * (`normalizeWordInput`). Возвращает ошибки по полям; пустой объект — всё в порядке.
 */
export function validateWordInput(input: WordInput): FieldErrors {
  const errors: FieldErrors = {}
  const hy = validateArmenian(input.hy, LIMITS.hy, true)
  if (hy) errors.hy = hy

  if (input.ru === '') errors.ru = MESSAGES.noRu
  else if (len(input.ru) > LIMITS.ru) errors.ru = MESSAGES.tooLong(LIMITS.ru)

  if (input.translit !== '') {
    if (!TRANSLIT_OK.test(input.translit)) {
      errors.translit = MESSAGES.badTranslit(invalidTranslitChars(input.translit))
    } else if (len(input.translit) > LIMITS.translit) {
      errors.translit = MESSAGES.tooLong(LIMITS.translit)
    }
  }

  const exampleHy = validateArmenian(input.exampleHy, LIMITS.example, false)
  if (exampleHy) errors.exampleHy = exampleHy

  if (input.exampleRu !== '') {
    if (input.exampleHy === '') errors.exampleRu = MESSAGES.exampleFirst
    else if (len(input.exampleRu) > LIMITS.example) {
      errors.exampleRu = MESSAGES.tooLong(LIMITS.example)
    }
  }
  return errors
}

/** Первая по порядку ошибка (для строк импорта и вставки: причина одна). */
export function firstError(errors: FieldErrors): string | null {
  for (const f of FIELD_ORDER) if (errors[f]) return errors[f]!
  return null
}

/** Первое поле с ошибкой (куда ставить фокус). */
export function firstErrorField(errors: FieldErrors): WordField | null {
  return FIELD_ORDER.find((f) => errors[f]) ?? null
}

export type SetTitleError = 'empty' | 'tooLong' | 'duplicate'

export const SET_TITLE_MESSAGES: Record<SetTitleError, string> = {
  empty: 'Введите название набора',
  tooLong: `Слишком длинно: максимум ${LIMITS.setTitle} символов`,
  duplicate: 'Набор с таким названием уже есть',
}

/**
 * Название набора (критерий 40): 1–50 символов после обрезки, уникально без учёта регистра.
 * `others` — названия остальных своих наборов (при переименовании без самого себя).
 */
export function validateSetTitle(title: string, others: readonly string[]): SetTitleError | null {
  const t = normalizeText(title)
  if (t === '') return 'empty'
  if (len(t) > LIMITS.setTitle) return 'tooLong'
  const key = t.toLowerCase()
  if (others.some((o) => normalizeText(o).toLowerCase() === key)) return 'duplicate'
  return null
}

/** Название набора по умолчанию: «Набор от ДД.ММ» (сегодняшняя дата, критерий 40). */
export function defaultSetTitle(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `Набор от ${dd}.${mm}`
}
