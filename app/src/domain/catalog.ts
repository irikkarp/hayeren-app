import type { BuiltinWord, CardWord, Content, Topic, UserSet, UserWord } from './types'

export interface Catalog {
  topics: Topic[]
  /** Все слова: сначала встроенные в порядке файла, затем свои в порядке добавления. */
  words: CardWord[]
  byId: Map<string, CardWord>
  topicWords: (topicId: string) => CardWord[]
  setWords: (setId: string) => CardWord[]
}

export function builtinToCard(w: BuiltinWord): CardWord {
  return {
    id: w.id,
    source: 'builtin',
    topicId: w.topic,
    setId: null,
    hy: w.hy,
    translit: w.translit,
    translitAuto: false,
    ru: w.ru,
    exampleHy: w.example_hy,
    exampleRu: w.example_ru,
  }
}

export function userToCard(w: UserWord): CardWord {
  return {
    id: w.id,
    source: 'user',
    topicId: null,
    setId: w.setId,
    hy: w.hy,
    translit: w.translit,
    translitAuto: w.translitAuto,
    ru: w.ru,
    exampleHy: w.exampleHy,
    exampleRu: w.exampleRu,
  }
}

/** Собирает каталог. Свои слова удалённых или отсутствующих наборов в каталог не попадают. */
export function buildCatalog(
  content: Content,
  userSets: readonly UserSet[] = [],
  userWords: readonly UserWord[] = [],
): Catalog {
  const topics = [...content.topics].sort((a, b) => a.order - b.order)
  const liveSets = new Set(userSets.filter((s) => s.deletedAt == null).map((s) => s.id))
  const user = userWords
    .filter((w) => w.deletedAt == null && liveSets.has(w.setId))
    .sort((a, b) => a.createdAt - b.createdAt)

  const words = [...content.words.map(builtinToCard), ...user.map(userToCard)]
  const byId = new Map(words.map((w) => [w.id, w]))
  const byTopic = new Map<string, CardWord[]>()
  const bySet = new Map<string, CardWord[]>()
  for (const w of words) {
    if (w.topicId) byTopic.set(w.topicId, [...(byTopic.get(w.topicId) ?? []), w])
    if (w.setId) bySet.set(w.setId, [...(bySet.get(w.setId) ?? []), w])
  }
  return {
    topics,
    words,
    byId,
    topicWords: (id) => byTopic.get(id) ?? [],
    setWords: (id) => bySet.get(id) ?? [],
  }
}
