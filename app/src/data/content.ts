import raw from '@content/words.json'
import type { Content } from '../domain/types'

/** Встроенный словарь: данные из docs/content/words.json, в код слова не зашиты. */
export const content: Content = raw

/**
 * Проверка целостности словаря (критерий 37): id уникальны, каждая тема объявлена,
 * обязательные поля непустые. Возвращает список ошибок (пустой — всё в порядке).
 */
export function validateContent(c: Content): string[] {
  const errors: string[] = []
  const topicIds = new Set<string>()
  for (const t of c.topics) {
    if (topicIds.has(t.id)) errors.push(`Тема ${t.id}: повторяющийся id`)
    topicIds.add(t.id)
    if (!t.title_ru.trim()) errors.push(`Тема ${t.id}: пустое название`)
  }
  const ids = new Set<string>()
  const required = [
    'id',
    'topic',
    'hy',
    'translit',
    'ru',
    'pos',
    'example_hy',
    'example_ru',
  ] as const
  for (const w of c.words) {
    if (ids.has(w.id)) errors.push(`Слово ${w.id}: повторяющийся id`)
    ids.add(w.id)
    if (!topicIds.has(w.topic)) errors.push(`Слово ${w.id}: неизвестная тема ${w.topic}`)
    for (const f of required) {
      if (typeof w[f] !== 'string' || !w[f].trim()) errors.push(`Слово ${w.id}: пустое поле ${f}`)
    }
  }
  return errors
}
