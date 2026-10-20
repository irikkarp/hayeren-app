import { wordTranslit } from './parsedRows'
import { normalizeKey } from './text'
import type { UserSet, UserWord } from './types'
import { transliterate } from './translit'
import { normalizeWordInput, type WordInput } from './wordValidation'

export function makeUserSet(id: string, title: string, now: number): UserSet {
  return { id, title, createdAt: now, updatedAt: now, deletedAt: null }
}

/** Новое своё слово из нормализованных полей; пустая транслитерация создаётся автоматически. */
export function makeUserWord(
  id: string,
  setId: string,
  fields: WordInput,
  createdAt: number,
  now: number = createdAt,
): UserWord {
  const { translit, auto } = wordTranslit(fields)
  return {
    id,
    setId,
    hy: fields.hy,
    ru: fields.ru,
    translit,
    translitAuto: auto,
    exampleHy: fields.exampleHy,
    exampleRu: fields.exampleRu,
    createdAt,
    updatedAt: now,
    deletedAt: null,
  }
}

/**
 * Изменение слова (критерии 55, 81): `id`, набор, `createdAt` и состояние SRS не меняются.
 * Пустая транслитерация (в том числе у слова с авто-транслитерацией, у которого поле оставили
 * пустым) создаётся заново по текущему `hy`; введённая — становится ручной.
 */
export function editUserWord(prev: UserWord, input: WordInput, now: number): UserWord {
  const f = normalizeWordInput(input)
  const auto = f.translit === ''
  return {
    ...prev,
    hy: f.hy,
    ru: f.ru,
    translit: auto ? transliterate(f.hy) : f.translit,
    translitAuto: auto,
    exampleHy: f.exampleHy,
    exampleRu: f.exampleRu,
    updatedAt: now,
  }
}

/** Значение поля транслитерации в форме изменения: у авто-слова пусто (будет пересчитано). */
export const translitFieldValue = (w: UserWord): string => (w.translitAuto ? '' : w.translit)

/** Ключи слов набора для поиска дубликатов (критерий 57). */
export function wordKeys(words: readonly Pick<UserWord, 'hy'>[]): Set<string> {
  return new Set(words.map((w) => normalizeKey(w.hy)))
}

export function wordStatus(box: number | undefined): 'new' | 'learning' | 'learned' {
  if (box === undefined) return 'new'
  return box >= 4 ? 'learned' : 'learning'
}
export const STATUS_LABEL = { new: 'новое', learning: 'учу', learned: 'выучено' } as const
