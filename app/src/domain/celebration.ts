import type { Catalog } from './catalog'
import { isLearned, LEARNED_BOX } from './srs'
import type { CardWord, CelebrationMap, CelebrationRec, ProgressMap, Topic } from './types'

/** Тема выучена, если в ней есть слова и все они в коробке ≥ 4 (критерий 8). */
export function isTopicLearned(catalog: Catalog, topicId: string, progress: ProgressMap): boolean {
  const words = catalog.topicWords(topicId)
  return words.length > 0 && words.every((w) => isLearned(progress[w.id]))
}

export interface CelebrationChange {
  map: CelebrationMap
  /** Записи, которые нужно сохранить (в том числе «надгробия» с deletedAt). */
  changed: CelebrationRec[]
}

const unchanged = (map: CelebrationMap): CelebrationChange => ({ map, changed: [] })

/**
 * Вызывается после ответа (progress уже обновлён). Если «Знаю» перевело слово встроенной темы
 * из коробки < 4 в коробку ≥ 4 и теперь выучена вся тема, а поздравления ещё не было,
 * тема помечается «ожидает поздравления» (критерий 125). Работает для сессий любого типа.
 */
export function noteAnswer(args: {
  map: CelebrationMap
  catalog: Catalog
  progress: ProgressMap
  word: CardWord
  prevBox: number | null
  newBox: number
  now: number
}): CelebrationChange {
  const { map, catalog, progress, word, prevBox, newBox, now } = args
  if (!word.topicId) return unchanged(map) // слова своих наборов на темы не влияют (критерий 124)
  const crossed = newBox >= LEARNED_BOX && (prevBox === null || prevBox < LEARNED_BOX)
  if (!crossed || map[word.topicId]) return unchanged(map)
  if (!isTopicLearned(catalog, word.topicId, progress)) return unchanged(map)
  const rec: CelebrationRec = {
    topicId: word.topicId,
    status: 'pending',
    updatedAt: now,
    deletedAt: null,
  }
  return { map: { ...map, [rec.topicId]: rec }, changed: [rec] }
}

export interface SessionEndCelebration extends CelebrationChange {
  /** Темы для экрана «Тема выучена» в порядке `order`; пусто — показывается обычный итог. */
  shown: Topic[]
}

/**
 * Конец сессии (критерий 126): ожидающие темы, которые всё ещё выучены, показываются и
 * помечаются отпразднованными (127); ожидающие, но уже не выученные, снимаются с ожидания
 * и отпразднованными не считаются.
 */
export function resolveSessionEnd(args: {
  map: CelebrationMap
  catalog: Catalog
  progress: ProgressMap
  now: number
}): SessionEndCelebration {
  const { map, catalog, progress, now } = args
  const shown: Topic[] = []
  const changed: CelebrationRec[] = []
  const next: CelebrationMap = { ...map }
  for (const topic of catalog.topics) {
    const rec = map[topic.id]
    if (rec?.status !== 'pending') continue
    if (isTopicLearned(catalog, topic.id, progress)) {
      shown.push(topic)
      const done: CelebrationRec = { ...rec, status: 'celebrated', updatedAt: now }
      next[topic.id] = done
      changed.push(done)
    } else {
      delete next[topic.id]
      changed.push({ ...rec, updatedAt: now, deletedAt: now })
    }
  }
  return { map: next, changed, shown }
}

/** «Следующая тема»: первая по `order` не выученная и не входящая в показанные (критерий 131). */
export function pickNextTopic(
  catalog: Catalog,
  progress: ProgressMap,
  shownTopicIds: readonly string[],
): Topic | undefined {
  return catalog.topics.find(
    (t) => !shownTopicIds.includes(t.id) && !isTopicLearned(catalog, t.id, progress),
  )
}
