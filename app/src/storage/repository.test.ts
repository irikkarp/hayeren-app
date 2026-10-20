import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { prog, userSet, userWord } from '../test/fixtures'
import type { DayStats, Settings } from '../domain/types'
import { openIndexedDbRepository } from './indexedDbRepository'
import { MemoryRepository } from './memoryRepository'
import type { Repository } from './repository'

const settings: Settings = { id: 'settings', mode: 'reader', updatedAt: 1, deletedAt: null }
const day = (date: string, answered = 1): DayStats => ({
  date,
  answered,
  newStarted: 1,
  bonusNew: 0,
  updatedAt: 1,
  deletedAt: null,
})

/** Одни и те же проверки для обеих реализаций интерфейса Repository. */
function contract(
  name: string,
  make: () => Promise<{ repo: Repository; reopen: () => Promise<Repository> }>,
) {
  describe(`Repository: ${name}`, () => {
    it('пустое хранилище: настроек нет (первый запуск, критерий 1)', async () => {
      const { repo } = await make()
      expect(await repo.load()).toEqual({
        settings: null,
        progress: [],
        days: [],
        celebrations: [],
        userSets: [],
        userWords: [],
        lastBackupAt: null,
      })
    })

    it('98: дата последней копии сохраняется, переживает перезапуск и не сбрасывается с прогрессом', async () => {
      const { repo, reopen } = await make()
      await repo.putLastBackup(1_700_000_000_000)
      await repo.resetProgress(5)
      expect((await (await reopen()).load()).lastBackupAt).toBe(1_700_000_000_000)
    })

    it('20: ответ сохраняется целиком и виден после «перезапуска»', async () => {
      const { repo, reopen } = await make()
      await repo.putSettings(settings)
      await repo.commitAnswer({
        progress: prog('a-01', 2, '2026-10-21'),
        day: day('2026-10-19'),
        celebrations: [{ topicId: 'a', status: 'pending', updatedAt: 1, deletedAt: null }],
      })
      const snap = await (await reopen()).load()
      expect(snap.settings).toEqual(settings)
      expect(snap.progress).toEqual([prog('a-01', 2, '2026-10-21')])
      expect(snap.days).toEqual([day('2026-10-19')])
      expect(snap.celebrations).toHaveLength(1)
    })

    it('запись по тому же ключу заменяет прежнюю', async () => {
      const { repo } = await make()
      await repo.commitAnswer({
        progress: prog('a-01', 2, 'x'),
        day: day('2026-10-19', 1),
        celebrations: [],
      })
      await repo.commitAnswer({
        progress: prog('a-01', 3, 'y'),
        day: day('2026-10-19', 2),
        celebrations: [],
      })
      const snap = await repo.load()
      expect(snap.progress).toHaveLength(1)
      expect(snap.progress[0].box).toBe(3)
      expect(snap.days[0].answered).toBe(2)
    })

    it('35/86/135: сброс прогресса мягко удаляет состояния, дни и отметки; режим и свои слова остаются', async () => {
      const { repo, reopen } = await make()
      await repo.putSettings(settings)
      await repo.putUserSet(userSet('s1'))
      await repo.putUserWords([userWord('u-1', 's1')])
      await repo.commitAnswer({
        progress: prog('a-01', 2, 'x'),
        day: day('2026-10-19'),
        celebrations: [{ topicId: 'a', status: 'celebrated', updatedAt: 1, deletedAt: null }],
      })
      await repo.resetProgress(99)
      const snap = await (await reopen()).load()
      expect(snap.progress).toEqual([])
      expect(snap.days).toEqual([])
      expect(snap.celebrations).toEqual([])
      expect(snap.settings).toEqual(settings)
      expect(snap.userSets).toHaveLength(1)
      expect(snap.userWords).toHaveLength(1)
      // После сброса можно учить заново.
      await repo.commitAnswer({
        progress: prog('a-01', 2, 'x'),
        day: day('2026-10-19'),
        celebrations: [],
      })
      expect((await repo.load()).progress).toHaveLength(1)
    })

    it('свои наборы и слова: мягкое удаление скрывает запись (задел под этап 2)', async () => {
      const { repo } = await make()
      await repo.putUserSet(userSet('s1'))
      await repo.putUserWords([userWord('u-1', 's1'), userWord('u-2', 's1')])
      await repo.putUserWords([{ ...userWord('u-2', 's1'), deletedAt: 5, updatedAt: 5 }])
      const snap = await repo.load()
      expect(snap.userWords.map((w) => w.id)).toEqual(['u-1'])
    })

    it('commitUserData: наборы, слова и удаление состояний одной записью; после перезапуска всё на месте', async () => {
      const { repo, reopen } = await make()
      await repo.commitAnswer({
        progress: prog('u-1', 2, 'x'),
        day: day('2026-10-19'),
        celebrations: [],
      })
      await repo.commitAnswer({
        progress: prog('u-2', 2, 'x'),
        day: day('2026-10-19'),
        celebrations: [],
      })
      await repo.commitUserData({
        sets: [userSet('s1')],
        words: [userWord('u-1', 's1'), userWord('u-2', 's1')],
        deleteProgress: [],
        now: 10,
      })
      let snap = await (await reopen()).load()
      expect(snap.userSets.map((x) => x.id)).toEqual(['s1'])
      expect(snap.userWords.map((x) => x.id).sort()).toEqual(['u-1', 'u-2'])
      expect(snap.progress).toHaveLength(2)

      // Мягкое удаление слова и его состояния; второе слово и его состояние остаются.
      await repo.commitUserData({
        sets: [],
        words: [{ ...userWord('u-1', 's1'), deletedAt: 20, updatedAt: 20 }],
        deleteProgress: ['u-1', 'нет-такого'],
        now: 20,
      })
      snap = await (await reopen()).load()
      expect(snap.userWords.map((x) => x.id)).toEqual(['u-2'])
      expect(snap.progress.map((p) => p.wordId)).toEqual(['u-2'])
    })
  })
}

contract('в памяти', async () => {
  const repo = new MemoryRepository(true)
  return { repo, reopen: async () => repo }
})

contract('IndexedDB', async () => {
  const factory = new IDBFactory()
  return {
    repo: await openIndexedDbRepository(factory),
    reopen: () => openIndexedDbRepository(factory),
  }
})

describe('openIndexedDbRepository', () => {
  it('без IndexedDB бросает ошибку (приложение перейдёт на хранилище в памяти)', async () => {
    await expect(openIndexedDbRepository(undefined as unknown as IDBFactory)).rejects.toThrow()
  })
  it('persistent: IndexedDB — true, память по умолчанию — false', async () => {
    expect((await openIndexedDbRepository(new IDBFactory())).persistent).toBe(true)
    expect(new MemoryRepository().persistent).toBe(false)
  })
})
