import { describe, expect, it } from 'vitest'
import { content } from '../data/content'
import { toDateKey } from '../domain/dates'
import type { SessionTarget } from '../domain/queue'
import { dropMissing, isFinished, sessionStats, type Verdict } from '../domain/session'
import { countDue, learnedCount } from '../domain/stats'
import { MemoryRepository } from '../storage/memoryRepository'
import type { Repository } from '../storage/repository'
import { prog, userSet, userWord } from '../test/fixtures'
import { AppStore } from './appStore'

function makeStore(repo: Repository, start = new Date(2026, 9, 19, 10, 0)) {
  const clock = { now: start }
  const store = new AppStore({
    openRepository: async () => repo,
    content,
    now: () => clock.now,
  })
  return { store, clock }
}

async function ready(repo: Repository = new MemoryRepository(true), start?: Date) {
  const ctl = makeStore(repo, start)
  await ctl.store.start()
  await ctl.store.chooseMode('beginner')
  return { ...ctl, repo }
}

/** Проходит сессию целиком, отвечая по функции verdict. */
function play(
  store: AppStore,
  target: SessionTarget,
  verdict: (wordId: string) => Verdict = () => 'know',
) {
  let session = store.startSession(target)
  const streakBefore = store.streak()
  while (!isFinished(session)) {
    session = store.answerCurrent(session, verdict(session.queue[0].wordId)).session
  }
  store.finishSession(target, sessionStats(session), false, streakBefore)
  return session
}

const topicOf = (id: string) => ({ type: 'topic', topicId: id }) as const
const topicIds = (topic: string) => content.words.filter((w) => w.topic === topic).map((w) => w.id)

describe('запуск и онбординг (критерии 1–4)', () => {
  it('первый запуск: режима нет; после выбора он сохраняется и переживает перезапуск', async () => {
    const repo = new MemoryRepository(true)
    const { store } = makeStore(repo)
    await store.start()
    expect(store.getState()).toMatchObject({ phase: 'ready', settings: null, persistent: true })

    expect(await store.chooseMode('reader')).toBe(true)
    expect(store.getState().settings?.mode).toBe('reader')

    const second = makeStore(repo)
    await second.store.start()
    expect(second.store.getState().settings?.mode).toBe('reader')
  })

  it('34: смена режима не меняет прогресс', async () => {
    const { store } = await ready()
    play(store, topicOf('greetings'))
    const before = store.getState().progress
    await store.setMode('reader')
    expect(store.getState().settings?.mode).toBe('reader')
    expect(store.getState().progress).toBe(before)
  })

  it('ошибка записи выбора режима: выбор не применяется', async () => {
    const repo = new MemoryRepository(true)
    repo.putSettings = async () => {
      throw new Error('quota')
    }
    const { store } = makeStore(repo)
    await store.start()
    expect(await store.chooseMode('beginner')).toBe(false)
    expect(store.getState().settings).toBeNull()
  })

  it('30: хранилище недоступно — работаем в памяти, persistent = false', async () => {
    const { store } = makeStore(new MemoryRepository(false))
    await store.start()
    expect(store.getState().persistent).toBe(false)
    await store.chooseMode('beginner')
    play(store, topicOf('greetings'), () => 'know')
    expect(learnedCount(store.getCatalog(), store.getState().progress)).toBe(0)
    expect(Object.keys(store.getState().progress)).toHaveLength(10)
  })

  it('ошибка чтения хранилища — фаза error', async () => {
    const repo = new MemoryRepository(true)
    repo.load = async () => {
      throw new Error('boom')
    }
    const { store } = makeStore(repo)
    await store.start()
    expect(store.getState().phase).toBe('error')
  })
})

describe('сессия и сохранение (критерии 15–20, 31)', () => {
  it('15/20: «Знаю» на новом слове → коробка 2, +2 дня; ответ виден после перезапуска', async () => {
    const { store, repo } = await ready()
    const session = store.startSession(topicOf('greetings'))
    store.answerCurrent(session, 'know')
    const id = session.queue[0].wordId
    expect(store.getState().progress[id]).toMatchObject({ box: 2, dueDate: '2026-10-21' })

    const again = makeStore(repo)
    await again.store.start()
    expect(again.store.getState().progress[id]).toMatchObject({ box: 2, dueDate: '2026-10-21' })
    expect(again.store.getState().days['2026-10-19']).toMatchObject({ answered: 1, newStarted: 1 })
  })

  it('19: после 10 новых слов в тему новые не добавляются; «ещё 10» поднимает лимит', async () => {
    const { store } = await ready()
    play(store, topicOf('greetings')) // 10 из 15
    expect(store.startSession(topicOf('greetings')).queue).toHaveLength(0)
    store.addBonusNew()
    const q = store.startSession(topicOf('greetings')).queue
    expect(q).toHaveLength(5) // осталось 5 новых в теме
    expect(q.every((i) => i.kind === 'new')).toBe(true)
  })

  it('лимит новых слов сбрасывается в полночь (по локальной дате)', async () => {
    const { store, clock } = await ready(undefined, new Date(2026, 9, 19, 23, 50))
    play(store, topicOf('greetings'))
    expect(store.startSession(topicOf('numbers')).queue).toHaveLength(0)
    clock.now = new Date(2026, 9, 20, 0, 10)
    store.refreshToday()
    expect(store.getState().today).toBe('2026-10-20')
    expect(
      store.startSession(topicOf('numbers')).queue.filter((i) => i.kind === 'new'),
    ).toHaveLength(10)
  })

  it('112/146: N обновляется при смене даты; слова с dueDate = сегодня входят в N', async () => {
    const { store, clock } = await ready()
    play(store, topicOf('greetings')) // 10 слов, все в коробке 2 → срок 21 октября
    const n = () => countDue(store.getCatalog(), store.getState().progress, store.getState().today)
    expect(n()).toBe(0)
    clock.now = new Date(2026, 9, 21, 8, 0)
    store.refreshToday()
    expect(n()).toBe(10)
  })

  it('31: прогресс по удалённым из словаря id игнорируется без ошибок', async () => {
    const repo = new MemoryRepository(true)
    await repo.commitAnswer({
      progress: {
        wordId: 'old-99',
        box: 5,
        dueDate: '2026-01-01',
        lastReviewed: '2026-01-01',
        correct: 1,
        wrong: 0,
        updatedAt: 1,
        deletedAt: null,
      },
      day: {
        date: '2026-01-01',
        answered: 1,
        newStarted: 0,
        bonusNew: 0,
        updatedAt: 1,
        deletedAt: null,
      },
      celebrations: [],
    })
    const { store } = makeStore(repo)
    await store.start()
    const { progress } = store.getState()
    expect(countDue(store.getCatalog(), progress, '2026-10-19')).toBe(0)
    expect(learnedCount(store.getCatalog(), progress)).toBe(0)
  })

  it('ошибка записи ответа: состояние остаётся в памяти, ставится saveFailed', async () => {
    const repo = new MemoryRepository(true)
    const { store } = await ready(repo)
    repo.commitAnswer = async () => {
      throw new Error('quota')
    }
    const session = store.startSession(topicOf('greetings'))
    store.answerCurrent(session, 'know')
    await Promise.resolve()
    await Promise.resolve()
    expect(store.getState().saveFailed).toBe(true)
    expect(Object.keys(store.getState().progress)).toHaveLength(1)
  })
})

describe('надёжность записи', () => {
  it('whenSaved ждёт завершения медленной записи ответа', async () => {
    const repo = new MemoryRepository(true)
    const { store } = await ready(repo)
    let written = false
    const original = repo.commitAnswer.bind(repo)
    repo.commitAnswer = async (b) => {
      await new Promise((r) => setTimeout(r, 20))
      await original(b)
      written = true
    }
    store.answerCurrent(store.startSession(topicOf('greetings')), 'know')
    expect(written).toBe(false)
    await store.whenSaved()
    expect(written).toBe(true)
    expect((await repo.load()).progress).toHaveLength(1)
  })

  it('итог сессии очищается: повторно его показать нельзя (критерий 137)', async () => {
    const { store } = await ready()
    play(store, topicOf('greetings'))
    expect(store.getState().lastResult).not.toBeNull()
    store.clearResult()
    expect(store.getState().lastResult).toBeNull()
  })
})

describe('серия (критерии 24–26, 144)', () => {
  it('растёт с первым ответом дня и сохраняется до конца следующего дня', async () => {
    const { store, clock } = await ready()
    expect(store.streak()).toBe(0)
    const s = store.startSession(topicOf('greetings'))
    store.answerCurrent(s, 'know')
    expect(store.streak()).toBe(1)

    clock.now = new Date(2026, 9, 20, 9, 0)
    store.refreshToday()
    expect(store.streak()).toBe(1) // вчера отвечали, сегодня ещё нет
    store.answerCurrent(store.startSession(topicOf('numbers')), 'know')
    expect(store.streak()).toBe(2)
    store.answerCurrent(store.startSession(topicOf('numbers')), 'know')
    expect(store.streak()).toBe(2) // дополнительные ответы в тот же день серию не меняют

    clock.now = new Date(2026, 9, 23, 9, 0)
    store.refreshToday()
    expect(store.streak()).toBe(0)
  })
})

describe('«Тема выучена» (критерии 124–135, 138)', () => {
  /** Доводит тему до коробки 3 для всех слов, кроме последнего, которое оставляет в коробке 3. */
  async function nearlyLearned(topic: string, repo: Repository = new MemoryRepository(true)) {
    const ctl = await ready(repo)
    const now = Date.now()
    for (const [i, wordId] of topicIds(topic).entries()) {
      const box = i === 0 ? 3 : 4
      await repo.commitAnswer({
        progress: {
          wordId,
          box,
          dueDate: toDateKey(ctl.clock.now),
          lastReviewed: '2026-10-01',
          correct: 1,
          wrong: 0,
          updatedAt: now,
          deletedAt: null,
        },
        day: {
          date: '2026-10-01',
          answered: 1,
          newStarted: 1,
          bonusNew: 0,
          updatedAt: now,
          deletedAt: null,
        },
        celebrations: [],
      })
    }
    const reloaded = makeStore(repo, ctl.clock.now)
    await reloaded.store.start()
    return { ...reloaded, repo }
  }

  it('138а/126: последнее слово 3 → 4 в сессии по теме даёт один S04b; повторно не показывается', async () => {
    const { store } = await nearlyLearned('housing')
    play(store, topicOf('housing'))
    expect(store.getState().lastResult?.celebratedTopicIds).toEqual(['housing'])
    expect(store.getState().celebrations.housing.status).toBe('celebrated')
  })

  it('125: «Знаю» в общей сессии тоже помечает тему, показ в конце сессии', async () => {
    const { store } = await nearlyLearned('food')
    play(store, { type: 'review' })
    expect(store.getState().lastResult).toMatchObject({
      target: { type: 'review' },
      celebratedTopicIds: ['food'],
    })
  })

  it('138б/124: сессия по своему набору, где все слова выучены, S04b не вызывает', async () => {
    const repo = new MemoryRepository(true)
    await repo.putUserSet(userSet('s1'))
    await repo.putUserWords([userWord('u-1', 's1', 1), userWord('u-2', 's1', 2)])
    for (const id of ['u-1', 'u-2']) {
      await repo.commitAnswer({
        progress: prog(id, 3, '2026-10-19'),
        day: {
          date: '2026-10-01',
          answered: 1,
          newStarted: 0,
          bonusNew: 0,
          updatedAt: 1,
          deletedAt: null,
        },
        celebrations: [],
      })
    }
    const { store } = await ready(repo)
    play(store, { type: 'set', setId: 's1' })
    const progress = store.getState().progress
    expect([progress['u-1'].box, progress['u-2'].box]).toEqual([4, 4])
    expect(store.getState().celebrations).toEqual({})
    expect(store.getState().lastResult?.celebratedTopicIds).toEqual([])
    expect(store.getState().lastResult?.stats.passed).toBe(2)
  })

  it('138е/128: закрытие вкладки до показа сохраняет ожидание; S04b будет в конце следующей сессии', async () => {
    const repo = new MemoryRepository(true)
    const first = await nearlyLearned('transport', repo)
    // Ответ «Знаю» на последнее слово, но экран итога не открывается (вкладку закрыли).
    let session = first.store.startSession({ type: 'review' })
    while (!isFinished(session)) session = first.store.answerCurrent(session, 'know').session
    await Promise.resolve()
    await Promise.resolve()
    expect(first.store.getState().celebrations.transport.status).toBe('pending')

    const second = makeStore(repo, first.clock.now)
    await second.store.start()
    expect(second.store.getState().celebrations.transport.status).toBe('pending')
    // Следующая сессия любого типа: например, остановленная сразу («Завершить»).
    second.store.finishSession(
      { type: 'topic', topicId: 'numbers' },
      { passed: 0, know: 0, dont: 0 },
      true,
      0,
    )
    expect(second.store.getState().lastResult?.celebratedTopicIds).toEqual(['transport'])
  })

  it('138д: слово упало в коробку 1 до конца сессии — ожидание снимается, тема не отпразднована', async () => {
    const { store } = await nearlyLearned('shop')
    // Знаю на последнее слово → ожидание; затем «Не знаю» на другое слово темы в той же сессии.
    const ids = topicIds('shop')
    const target = { type: 'review' } as const
    let session = store.startSession(target)
    const last = session.queue.find((i) => i.wordId === ids[0])!
    session = { ...session, queue: [last, ...session.queue.filter((i) => i !== last)] }
    session = store.answerCurrent(session, 'know').session
    expect(store.getState().celebrations.shop.status).toBe('pending')
    const other = session.queue.find((i) => i.wordId === ids[1])!
    session = { ...session, queue: [other] }
    store.answerCurrent(session, 'dont')
    store.finishSession(target, { passed: 2, know: 1, dont: 1 }, false, 0)
    expect(store.getState().lastResult?.celebratedTopicIds).toEqual([])
    expect(store.getState().celebrations.shop).toBeUndefined()
  })

  it('129: две темы за одну общую сессию — один экран, в порядке order', async () => {
    const repo = new MemoryRepository(true)
    const a = await nearlyLearned('food', repo) // order 6
    const b = await nearlyLearned('numbers', repo) // order 2
    void a
    play(b.store, { type: 'review' })
    expect(b.store.getState().lastResult?.celebratedTopicIds).toEqual(['numbers', 'food'])
  })

  it('138ж/135: сброс прогресса очищает отметки; после повторного изучения S04b снова показывается', async () => {
    const repo = new MemoryRepository(true)
    const { store } = await nearlyLearned('housing', repo)
    play(store, topicOf('housing'))
    expect(store.getState().celebrations.housing.status).toBe('celebrated')

    await store.resetProgress()
    expect(store.getState()).toMatchObject({ progress: {}, days: {}, celebrations: {} })
    expect(store.streak()).toBe(0)
    expect(store.getState().settings?.mode).toBe('beginner') // режим сохраняется

    const reloaded = makeStore(repo)
    await reloaded.store.start()
    expect(reloaded.store.getState().celebrations).toEqual({})
    expect(reloaded.store.getState().progress).toEqual({})
  })
})

describe('свои наборы и слова (критерии 38–44, 81–86)', () => {
  const plan = (n: number, setId = 's1', newSets = true) => ({
    newSets: newSets ? [userSet(setId, 100)] : [],
    words: Array.from({ length: n }, (_, i) => userWord(`u-${i + 1}`, setId, 101 + i)),
    touchedSetIds: [setId],
    touchedTitles: [`Набор ${setId}`],
  })

  it('сохранение: набор и слова попадают в каталог, в хранилище и переживают перезапуск', async () => {
    const repo = new MemoryRepository(true)
    const { store } = await ready(repo)
    expect(await store.saveUserWords(plan(3))).toBe(true)
    expect(store.getState().userSets).toHaveLength(1)
    expect(
      store
        .getCatalog()
        .setWords('s1')
        .map((w) => w.id),
    ).toEqual(['u-1', 'u-2', 'u-3'])
    expect(store.getCatalog().words).toHaveLength(88 + 3)

    const second = makeStore(repo)
    await second.store.start()
    expect(second.store.getCatalog().setWords('s1')).toHaveLength(3)
  })

  it('запись не удалась: false, состояние не менялось (ввод пользователя остаётся на экране)', async () => {
    const repo = new MemoryRepository(true)
    const { store } = await ready(repo)
    repo.commitUserData = async () => {
      throw new Error('диск полон')
    }
    expect(await store.saveUserWords(plan(2))).toBe(false)
    expect(store.getState().userWords).toEqual([])
    expect(store.getState().userSets).toEqual([])
  })

  it('42/111: свои слова участвуют в сессии набора и в «Повторить (N)» наравне со встроенными', async () => {
    const { store, clock } = await ready()
    await store.saveUserWords(plan(2))
    play(store, { type: 'set', setId: 's1' })
    expect(Object.keys(store.getState().progress).sort()).toEqual(['u-1', 'u-2'])
    clock.now = new Date(2026, 9, 21, 8, 0)
    store.refreshToday()
    const { progress, today } = store.getState()
    expect(countDue(store.getCatalog(), progress, today)).toBe(2)
    expect(store.startSession({ type: 'review' }).queue.map((i) => i.wordId)).toEqual([
      'u-1',
      'u-2',
    ])
  })

  it('42: дневной лимит новых слов общий со встроенными темами', async () => {
    const { store } = await ready()
    await store.saveUserWords(plan(12))
    play(store, topicOf('greetings')) // 10 новых слов за день
    expect(store.startSession({ type: 'set', setId: 's1' }).queue).toHaveLength(0)
  })

  it('81: изменение слова не трогает состояние SRS', async () => {
    const { store } = await ready()
    await store.saveUserWords(plan(1))
    play(store, { type: 'set', setId: 's1' })
    const before = store.getState().progress['u-1']
    expect(
      await store.updateWord('u-1', {
        hy: 'հաց',
        ru: 'хлеб',
        translit: '',
        exampleHy: '',
        exampleRu: '',
      }),
    ).toBe(true)
    const word = store.getState().userWords[0]
    expect(word).toMatchObject({ hy: 'հաց', translit: "hats'", translitAuto: true })
    expect(store.getState().progress['u-1']).toEqual(before)
  })

  it('82: удаление слова убирает его и его состояние; из очереди сессии оно исчезает', async () => {
    const repo = new MemoryRepository(true)
    const { store } = await ready(repo)
    await store.saveUserWords(plan(3))
    play(store, { type: 'set', setId: 's1' })
    expect(await store.deleteWord('u-2')).toBe(true)
    const snap = await repo.load()
    expect(snap.userWords.map((w) => w.id)).toEqual(['u-1', 'u-3'])
    expect(snap.progress.map((p) => p.wordId).sort()).toEqual(['u-1', 'u-3'])
    expect(store.getCatalog().byId.has('u-2')).toBe(false)
  })

  it('82: слово, удалённое во время сессии, из очереди пропадает', async () => {
    const { store } = await ready()
    await store.saveUserWords(plan(3))
    const session = store.startSession({ type: 'set', setId: 's1' })
    expect(session.queue.map((i) => i.wordId)).toEqual(['u-1', 'u-2', 'u-3'])
    await store.deleteWord('u-2')
    const alive = new Set(store.getCatalog().words.map((w) => w.id))
    expect(dropMissing(session, alive).queue.map((i) => i.wordId)).toEqual(['u-1', 'u-3'])
  })

  it('41: удаление набора убирает набор, все его слова и их состояния, остальные наборы целы', async () => {
    const repo = new MemoryRepository(true)
    const { store } = await ready(repo)
    await store.saveUserWords(plan(2, 's1'))
    await store.saveUserWords({
      newSets: [userSet('s2', 200)],
      words: [userWord('u-9', 's2', 201)],
      touchedSetIds: ['s2'],
      touchedTitles: ['Набор s2'],
    })
    play(store, { type: 'set', setId: 's1' })
    play(store, { type: 'set', setId: 's2' })
    expect(await store.deleteSet('s1')).toBe(true)
    const snap = await repo.load()
    expect(snap.userSets.map((s) => s.id)).toEqual(['s2'])
    expect(snap.userWords.map((w) => w.id)).toEqual(['u-9'])
    expect(snap.progress.map((p) => p.wordId)).toEqual(['u-9'])
    expect(store.getCatalog().words).toHaveLength(88 + 1)
  })

  it('40: переименование: ошибки названия, «без изменений», успех', async () => {
    const { store } = await ready()
    await store.saveUserWords(plan(1, 's1'))
    await store.saveUserWords({
      newSets: [{ ...userSet('s2', 200), title: 'Кухня' }],
      words: [],
      touchedSetIds: ['s2'],
      touchedTitles: ['Кухня'],
    })
    expect(await store.renameSet('s1', '  ')).toBe('empty')
    expect(await store.renameSet('s1', 'кухня')).toBe('duplicate')
    expect(await store.renameSet('s1', 'x'.repeat(51))).toBe('tooLong')
    expect(await store.renameSet('s1', 'Набор s1')).toBe('unchanged')
    expect(await store.renameSet('s1', 'НАБОР S1')).toBe('ok') // свой вариант в другом регистре
    expect(store.getState().userSets.find((s) => s.id === 's1')?.title).toBe('НАБОР S1')
  })

  it('43: набор без слов остаётся в списке', async () => {
    const { store } = await ready()
    await store.saveUserWords(plan(1))
    await store.deleteWord('u-1')
    expect(store.getState().userSets).toHaveLength(1)
    expect(store.getCatalog().setWords('s1')).toEqual([])
  })

  it('86: «Сбросить прогресс» не удаляет свои наборы и слова', async () => {
    const { store } = await ready()
    await store.saveUserWords(plan(2))
    play(store, { type: 'set', setId: 's1' })
    await store.resetProgress()
    expect(store.getState().progress).toEqual({})
    expect(store.getState().userWords).toHaveLength(2)
    expect(store.getState().userSets).toHaveLength(1)
  })

  it('незавершённый ввод: хранится в памяти и сбрасывается', async () => {
    const { store } = await ready()
    store.setAddFlow({ pasteText: 'բարև — привет' })
    expect(store.getState().addFlow.pasteText).toBe('բարև — привет')
    store.resetAddFlow()
    expect(store.getState().addFlow.pasteText).toBe('')
  })
})

describe('31: обновление словаря (words.json version 2) при сохранённом прогрессе', () => {
  it('прогресс по существующим id сохраняется, изменённый текст подхватывается, версия не важна', async () => {
    const repo = new MemoryRepository(true)
    const v1 = {
      ...content,
      version: 1,
      words: content.words.map((w) =>
        w.id === 'transport-10' ? { ...w, example_ru: 'Остановите здесь, пожалуйста.' } : w,
      ),
    }
    const first = new AppStore({ openRepository: async () => repo, content: v1 })
    await first.start()
    await first.chooseMode('beginner')
    play(first, topicOf('transport'))
    const progress = first.getState().progress
    await first.whenSaved()
    expect(progress['transport-10']).toBeDefined()

    // Новая версия приложения: version 2 и другой перевод примера.
    const second = new AppStore({ openRepository: async () => repo, content })
    await second.start()
    expect(content.version).toBeGreaterThanOrEqual(2)
    expect(second.getState().progress['transport-10']).toEqual(progress['transport-10'])
    expect(second.getCatalog().byId.get('transport-10')?.exampleRu).toBe(
      'Остановитесь здесь, пожалуйста.',
    )
    expect(learnedCount(second.getCatalog(), second.getState().progress)).toBe(
      learnedCount(first.getCatalog(), first.getState().progress),
    )
  })
})
