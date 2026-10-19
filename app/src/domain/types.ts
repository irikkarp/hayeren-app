import type { DateKey } from './dates'

export type Mode = 'beginner' | 'reader'

/** Общие поля изменяемых записей: под будущую синхронизацию с сервером (фича 003). */
export interface Syncable {
  /** Миллисекунды Unix (Date.now()) последнего изменения. */
  updatedAt: number
  /** Мягкое удаление: время удаления или null. Запись остаётся как «надгробие». */
  deletedAt: number | null
}

export interface Topic {
  id: string
  title_ru: string
  order: number
}

/** Слово из words.json. */
export interface BuiltinWord {
  id: string
  topic: string
  hy: string
  translit: string
  ru: string
  pos: string
  example_hy: string
  example_ru: string
  needs_review?: boolean
}

export interface Content {
  version: number
  language: string
  translit_scheme: string
  topics: Topic[]
  words: BuiltinWord[]
}

/** Свой набор слов (этап 2). `id` — UUID. */
export interface UserSet extends Syncable {
  id: string
  title: string
  createdAt: number
}

/** Своё слово (этап 2). `id` — `u-<UUID>`, не пересекается с id встроенных слов. */
export interface UserWord extends Syncable {
  id: string
  setId: string
  hy: string
  ru: string
  translit: string
  translitAuto: boolean
  exampleHy: string
  exampleRu: string
  createdAt: number
}

/** Единый вид слова для карточек, очередей и подсчётов: и встроенное, и своё. */
export interface CardWord {
  id: string
  source: 'builtin' | 'user'
  /** Тема встроенного слова; у своих слов null. */
  topicId: string | null
  /** Набор своего слова; у встроенных null. */
  setId: string | null
  hy: string
  translit: string
  translitAuto: boolean
  ru: string
  exampleHy: string
  exampleRu: string
}

export interface Settings extends Syncable {
  id: 'settings'
  mode: Mode
}

/** Состояние SRS слова. Хранится отдельно от слов, ключ — id слова. */
export interface WordProgress extends Syncable {
  wordId: string
  box: number
  dueDate: DateKey
  lastReviewed: DateKey
  correct: number
  wrong: number
}

/** Активность за календарный день: основа серии и дневного лимита новых слов. */
export interface DayStats extends Syncable {
  date: DateKey
  /** Сколько ответов, меняющих состояние слов, дано за день. */
  answered: number
  /** Сколько слов начато как новые за день. */
  newStarted: number
  /** На сколько увеличен дневной лимит новых слов кнопкой «Учить ещё 10». */
  bonusNew: number
}

/** Отметка по теме для экрана «Тема выучена». */
export interface CelebrationRec extends Syncable {
  topicId: string
  status: 'pending' | 'celebrated'
}

export type ProgressMap = Record<string, WordProgress>
export type DayMap = Record<string, DayStats>
export type CelebrationMap = Record<string, CelebrationRec>
