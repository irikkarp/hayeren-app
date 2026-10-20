import type {
  CelebrationRec,
  DayStats,
  Settings,
  UserSet,
  UserWord,
  WordProgress,
} from '../domain/types'
import {
  isLive,
  type AnswerBatch,
  type Repository,
  type Snapshot,
  type UserDataBatch,
} from './repository'

/**
 * Хранилище в памяти. Используется в тестах и как запасной вариант, когда IndexedDB недоступна
 * (приватный режим): приложение работает до закрытия вкладки, баннер B1 предупреждает об этом.
 */
export class MemoryRepository implements Repository {
  private settings: Settings | null = null
  private progress = new Map<string, WordProgress>()
  private days = new Map<string, DayStats>()
  private celebrations = new Map<string, CelebrationRec>()
  private userSets = new Map<string, UserSet>()
  private userWords = new Map<string, UserWord>()

  readonly persistent: boolean

  constructor(persistent = false) {
    this.persistent = persistent
  }

  async load(): Promise<Snapshot> {
    return {
      settings: this.settings && isLive(this.settings) ? this.settings : null,
      progress: [...this.progress.values()].filter(isLive),
      days: [...this.days.values()].filter(isLive),
      celebrations: [...this.celebrations.values()].filter(isLive),
      userSets: [...this.userSets.values()].filter(isLive),
      userWords: [...this.userWords.values()].filter(isLive),
    }
  }

  async putSettings(settings: Settings): Promise<void> {
    this.settings = settings
  }

  async commitAnswer(batch: AnswerBatch): Promise<void> {
    this.progress.set(batch.progress.wordId, batch.progress)
    this.days.set(batch.day.date, batch.day)
    for (const c of batch.celebrations) this.celebrations.set(c.topicId, c)
  }

  async putDay(day: DayStats): Promise<void> {
    this.days.set(day.date, day)
  }

  async putCelebrations(recs: CelebrationRec[]): Promise<void> {
    for (const c of recs) this.celebrations.set(c.topicId, c)
  }

  async resetProgress(now: number): Promise<void> {
    for (const map of [this.progress, this.days, this.celebrations] as Map<
      string,
      { deletedAt: number | null; updatedAt: number }
    >[]) {
      for (const [key, rec] of map) {
        if (isLive(rec)) map.set(key, { ...rec, deletedAt: now, updatedAt: now })
      }
    }
  }

  async putUserSet(set: UserSet): Promise<void> {
    this.userSets.set(set.id, set)
  }

  async putUserWords(words: UserWord[]): Promise<void> {
    for (const w of words) this.userWords.set(w.id, w)
  }

  async commitUserData(batch: UserDataBatch): Promise<void> {
    for (const s of batch.sets) this.userSets.set(s.id, s)
    for (const w of batch.words) this.userWords.set(w.id, w)
    for (const id of batch.deleteProgress) {
      const p = this.progress.get(id)
      if (p && isLive(p))
        this.progress.set(id, { ...p, deletedAt: batch.now, updatedAt: batch.now })
    }
  }
}
