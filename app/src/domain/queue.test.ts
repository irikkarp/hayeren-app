import { describe, expect, it } from 'vitest'
import { content } from '../data/content'
import { miniCatalog, miniContent, progressMap, prog, userSet, userWord } from '../test/fixtures'
import { buildCatalog } from './catalog'
import {
  buildQueue,
  canLearnMore,
  dueWords,
  newCapacity,
  SESSION_DUE_LIMIT,
  type QueueContext,
} from './queue'
import { answer, createSession, currentItem, isFinished } from './session'
import { countDue, hasAnyProgress, learnedCount } from './stats'
import type { DayStats } from './types'

const TODAY = '2026-10-19'
const day = (patch: Partial<DayStats> = {}): DayStats => ({
  date: TODAY,
  answered: 0,
  newStarted: 0,
  bonusNew: 0,
  updatedAt: 0,
  deletedAt: null,
  ...patch,
})
const ctx = (over: Partial<QueueContext> = {}): QueueContext => ({
  catalog: miniCatalog(),
  progress: {},
  today: TODAY,
  day: undefined,
  ...over,
})

describe('очередь сессии по теме (критерий 14)', () => {
  it('без прогресса — новые слова темы в порядке словаря, не больше 10 в день', () => {
    const full = buildCatalog(content)
    const q = buildQueue({ type: 'topic', topicId: 'greetings' }, ctx({ catalog: full }))
    expect(q).toHaveLength(10)
    expect(q.every((i) => i.kind === 'new')).toBe(true)
    expect(q.map((i) => i.wordId)).toEqual(
      content.words
        .filter((w) => w.topic === 'greetings')
        .slice(0, 10)
        .map((w) => w.id),
    )
  })

  it('сначала долги из всех тем (самые просроченные первыми), затем новые слова темы', () => {
    const progress = progressMap(
      prog('b-01', 2, '2026-10-19'),
      prog('a-01', 2, '2026-10-10'),
      prog('b-02', 2, '2026-10-15'),
    )
    const q = buildQueue({ type: 'topic', topicId: 'a' }, ctx({ progress }))
    expect(q.map((i) => `${i.wordId}:${i.kind}`)).toEqual([
      'a-01:review',
      'b-02:review',
      'b-01:review',
      'a-02:new',
      'a-03:new',
    ])
  })

  it('19: лимит новых 10 в день суммарно, «ещё 10» увеличивает лимит', () => {
    const catalog = buildCatalog(content)
    const target = { type: 'topic', topicId: 'numbers' } as const
    expect(newCapacity(undefined)).toBe(10)
    expect(newCapacity(day({ newStarted: 4 }))).toBe(6)
    expect(buildQueue(target, ctx({ catalog, day: day({ newStarted: 4 }) }))).toHaveLength(6)
    expect(buildQueue(target, ctx({ catalog, day: day({ newStarted: 10 }) }))).toHaveLength(0)
    expect(canLearnMore(target, ctx({ catalog, day: day({ newStarted: 10 }) }))).toBe(true)
    expect(canLearnMore(target, ctx({ catalog, day: day({ newStarted: 9 }) }))).toBe(false)
    const more = day({ newStarted: 10, bonusNew: 10 })
    expect(newCapacity(more)).toBe(10)
    expect(buildQueue(target, ctx({ catalog, day: more }))).toHaveLength(10)
  })

  it('«Учить ещё» не предлагается, если в цели не осталось новых слов', () => {
    const progress = progressMap(
      prog('a-01', 2, '2026-10-30'),
      prog('a-02', 2, '2026-10-30'),
      prog('a-03', 2, '2026-10-30'),
    )
    expect(
      canLearnMore(
        { type: 'topic', topicId: 'a' },
        ctx({ progress, day: day({ newStarted: 10 }) }),
      ),
    ).toBe(false)
  })

  it('долгов больше 30: в очередь входит ровно 30 слов к повторению', () => {
    const catalog = buildCatalog(content)
    const progress = progressMap(
      ...content.words.slice(0, 40).map((w, i) => prog(w.id, 2, `2026-09-${10 + (i % 15)}`)),
    )
    const q = buildQueue({ type: 'topic', topicId: 'food' }, ctx({ catalog, progress }))
    expect(q.filter((i) => i.kind === 'review')).toHaveLength(SESSION_DUE_LIMIT)
  })

  it('свои наборы: очередь по набору, новые слова в порядке добавления, лимит общий', () => {
    const catalog = buildCatalog(
      miniContent,
      [userSet('s1')],
      [userWord('u-2', 's1', 20), userWord('u-1', 's1', 10), userWord('u-3', 's1', 30)],
    )
    const q = buildQueue({ type: 'set', setId: 's1' }, ctx({ catalog }))
    expect(q.map((i) => i.wordId)).toEqual(['u-1', 'u-2', 'u-3'])
    const shared = buildQueue(
      { type: 'set', setId: 's1' },
      ctx({ catalog, day: day({ newStarted: 9 }) }),
    )
    expect(shared.map((i) => i.wordId)).toEqual(['u-1'])
  })
})

describe('общее повторение «Повторить (N)» (критерии 110–123)', () => {
  const review = { type: 'review' } as const

  it('115: порядок — по сроку, при равном сроке по коробке, затем по id', () => {
    const progress = progressMap(
      prog('b-01', 3, '2026-10-18'),
      prog('a-02', 2, '2026-10-18'),
      prog('a-01', 2, '2026-10-18'),
      prog('a-03', 1, '2026-10-19'),
      prog('b-02', 4, '2026-10-01'),
    )
    expect(dueWords(miniCatalog(), progress, TODAY).map((w) => w.id)).toEqual([
      'b-02',
      'a-01',
      'a-02',
      'b-01',
      'a-03',
    ])
  })

  it('123в: 45 долгов → в очереди ровно 30 самых просроченных, после 30 «Знаю» остаётся 15', () => {
    const catalog = buildCatalog(content)
    const base = ctx({ catalog })
    // 45 слов с разными сроками: чем больше индекс, тем свежее срок.
    const items = content.words.slice(0, 45).map((w, i) => {
      const d = new Date(2026, 8, 1 + i) // с 1 сентября, по одному дню
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return prog(w.id, 2, key)
    })
    let progress = progressMap(...items)
    expect(countDue(catalog, progress, TODAY)).toBe(45)

    const queue = buildQueue(review, { ...base, progress })
    expect(queue).toHaveLength(30)
    expect(queue.map((i) => i.wordId)).toEqual(content.words.slice(0, 30).map((w) => w.id))

    let session = createSession(queue)
    while (!isFinished(session)) {
      const out = answer(session, 'know', { progress, today: TODAY, now: 1 })
      if (out.update) progress = { ...progress, [out.update.progress.wordId]: out.update.progress }
      session = out.session
    }
    expect(countDue(catalog, progress, TODAY)).toBe(15)
  })

  it('116/123г: новые слова не попадают в очередь и не расходуют лимит', () => {
    const progress = progressMap(prog('a-01', 2, TODAY))
    const q = buildQueue(review, ctx({ progress }))
    expect(q).toEqual([{ wordId: 'a-01', kind: 'review' }])
    expect(buildQueue(review, ctx())).toEqual([])
    expect(canLearnMore(review, ctx())).toBe(false)

    // Ответы в общей сессии не увеличивают число начатых новых слов (wasNew = false).
    const out = answer(createSession(q), 'know', { progress, today: TODAY, now: 1 })
    expect(out.update?.wasNew).toBe(false)
  })

  it('123д: срок «сегодня» входит в N, «завтра» нет', () => {
    const catalog = miniCatalog()
    expect(countDue(catalog, progressMap(prog('a-01', 2, '2026-10-19')), TODAY)).toBe(1)
    expect(countDue(catalog, progressMap(prog('a-01', 2, '2026-10-20')), TODAY)).toBe(0)
  })

  it('123а: N на плитке и на кнопке — одна функция; считает встроенные и свои, новые не считает', () => {
    const catalog = buildCatalog(
      miniContent,
      [userSet('s1')],
      [userWord('u-1', 's1', 1), userWord('u-2', 's1', 2), userWord('u-3', 's1', 3)],
    )
    const progress = progressMap(
      prog('a-01', 2, '2026-10-01'), // просрочено
      prog('a-02', 3, TODAY), // сегодня
      prog('b-01', 3, '2026-10-20'), // завтра
      prog('u-1', 1, '2026-10-18'), // своё, просрочено
      prog('u-2', 4, '2026-10-25'), // своё, не пора
      prog('gone-99', 2, '2026-01-01'), // слова нет в каталоге (критерий 31)
    )
    // u-3, a-03, b-02, b-03 — новые.
    expect(countDue(catalog, progress, TODAY)).toBe(3)
    expect(dueWords(catalog, progress, TODAY)).toHaveLength(3)
    expect(learnedCount(catalog, progress)).toBe(1)
    expect(hasAnyProgress(catalog, progress)).toBe(true)
    expect(hasAnyProgress(catalog, {})).toBe(false)
    expect(hasAnyProgress(catalog, progressMap(prog('gone-99', 2, TODAY)))).toBe(false)
  })

  it('удалённые наборы и слова не попадают в каталог', () => {
    const deleted = { ...userSet('s2'), deletedAt: 5 }
    const catalog = buildCatalog(
      miniContent,
      [userSet('s1'), deleted],
      [userWord('u-1', 's1'), userWord('u-2', 's2'), { ...userWord('u-3', 's1'), deletedAt: 5 }],
    )
    expect(catalog.words.filter((w) => w.source === 'user').map((w) => w.id)).toEqual(['u-1'])
  })
})

describe('сессия (критерий 18)', () => {
  it('«Не знаю» ставит слово в конец один раз; повторный ответ состояние не меняет', () => {
    const queue = [
      { wordId: 'a-01', kind: 'new' as const },
      { wordId: 'a-02', kind: 'new' as const },
    ]
    let progress = progressMap()
    let s = createSession(queue)

    let out = answer(s, 'dont', { progress, today: TODAY, now: 1 })
    expect(out.update?.progress).toMatchObject({ box: 1, dueDate: '2026-10-20', wrong: 1 })
    expect(out.feedback).toEqual({ type: 'dont-first' })
    progress = { ...progress, 'a-01': out.update!.progress }
    s = out.session
    expect(s.queue.map((i) => `${i.wordId}:${i.kind}`)).toEqual(['a-02:new', 'a-01:again'])

    out = answer(s, 'know', { progress, today: TODAY, now: 2 })
    expect(out.feedback).toEqual({ type: 'know', days: 2 })
    progress = { ...progress, 'a-02': out.update!.progress }
    s = out.session
    expect(currentItem(s)).toEqual({ wordId: 'a-01', kind: 'again' })

    out = answer(s, 'know', { progress, today: TODAY, now: 3 })
    expect(out.update).toBeNull()
    expect(out.feedback).toEqual({ type: 'again', know: true })
    expect(progress['a-01']).toMatchObject({ box: 1, dueDate: '2026-10-20' })
    expect(isFinished(out.session)).toBe(true)

    // Повторный «Не знаю» тоже не возвращает слово в очередь.
    const again = answer(createSession([{ wordId: 'a-01', kind: 'again' }]), 'dont', {
      progress,
      today: TODAY,
      now: 4,
    })
    expect(again.update).toBeNull()
    expect(isFinished(again.session)).toBe(true)
  })
})
