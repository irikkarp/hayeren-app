import { buildCatalog } from '../domain/catalog'
import type { DateKey } from '../domain/dates'
import type { Content, ProgressMap, UserSet, UserWord, WordProgress } from '../domain/types'

/** Маленький словарь для тестов: две темы по 3 слова. */
export const miniContent: Content = {
  version: 1,
  language: 'hy-east',
  translit_scheme: 'hayeren-latin-v1',
  topics: [
    { id: 'b', title_ru: 'Тема B', order: 2 },
    { id: 'a', title_ru: 'Тема A', order: 1 },
  ],
  words: [
    ...['a-01', 'a-02', 'a-03'].map((id) => word(id, 'a')),
    ...['b-01', 'b-02', 'b-03'].map((id) => word(id, 'b')),
  ],
}

function word(id: string, topic: string) {
  return {
    id,
    topic,
    hy: `ա${id}`,
    translit: `a${id}`,
    ru: `слово ${id}`,
    pos: 'noun',
    example_hy: `Օրինակ ${id}։`,
    example_ru: `пример ${id}`,
  }
}

export const miniCatalog = () => buildCatalog(miniContent)

export function userSet(id: string, createdAt = 1): UserSet {
  return { id, title: `Набор ${id}`, createdAt, updatedAt: createdAt, deletedAt: null }
}

export function userWord(id: string, setId: string, createdAt = 1): UserWord {
  return {
    id,
    setId,
    hy: 'բարև',
    ru: 'привет',
    translit: 'barev',
    translitAuto: true,
    exampleHy: '',
    exampleRu: '',
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  }
}

export function prog(
  wordId: string,
  box: number,
  dueDate: DateKey,
  extra: Partial<WordProgress> = {},
): WordProgress {
  return {
    wordId,
    box,
    dueDate,
    lastReviewed: '2026-01-01',
    correct: 0,
    wrong: 0,
    updatedAt: 0,
    deletedAt: null,
    ...extra,
  }
}

export const progressMap = (...items: WordProgress[]): ProgressMap =>
  Object.fromEntries(items.map((p) => [p.wordId, p]))
