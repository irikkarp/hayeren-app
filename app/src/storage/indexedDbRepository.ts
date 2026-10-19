import { isLive, type AnswerBatch, type Repository, type Snapshot } from './repository'
import { MemoryRepository } from './memoryRepository'
import type {
  CelebrationRec,
  DayStats,
  Settings,
  UserSet,
  UserWord,
  WordProgress,
} from '../domain/types'

export const DB_NAME = 'hayeren'
export const DB_VERSION = 1

// Хранилища и ключи. Версии схемы повышаются через onupgradeneeded (миграции по oldVersion).
const STORES = {
  settings: 'id',
  progress: 'wordId',
  days: 'date',
  celebrations: 'topicId',
  userSets: 'id',
  userWords: 'id',
  meta: 'key', // задел под этап 3 (дата последней резервной копии)
} as const
type StoreName = keyof typeof STORES

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath })
      }
      // Индекс для будущих выборок слов набора.
      if (
        req.transaction &&
        !req.transaction.objectStore('userWords').indexNames.contains('setId')
      ) {
        req.transaction.objectStore('userWords').createIndex('setId', 'setId')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB заблокирована'))
  })
}

class IndexedDbRepository implements Repository {
  readonly persistent = true
  private readonly db: IDBDatabase

  constructor(db: IDBDatabase) {
    this.db = db
  }

  /** Выполняет работу в одной транзакции и ждёт её завершения (атомарность записи). */
  private run(
    stores: StoreName[],
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, mode)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Транзакция прервана'))
      work(tx)
    })
  }

  private async all<T extends { deletedAt: number | null }>(name: StoreName): Promise<T[]> {
    const rows = await request(
      this.db.transaction(name).objectStore(name).getAll() as IDBRequest<T[]>,
    )
    return rows.filter(isLive)
  }

  async load(): Promise<Snapshot> {
    const settings = await request(
      this.db.transaction('settings').objectStore('settings').get('settings') as IDBRequest<
        Settings | undefined
      >,
    )
    return {
      settings: settings && isLive(settings) ? settings : null,
      progress: await this.all<WordProgress>('progress'),
      days: await this.all<DayStats>('days'),
      celebrations: await this.all<CelebrationRec>('celebrations'),
      userSets: await this.all<UserSet>('userSets'),
      userWords: await this.all<UserWord>('userWords'),
    }
  }

  putSettings(settings: Settings): Promise<void> {
    return this.run(
      ['settings'],
      'readwrite',
      (tx) => void tx.objectStore('settings').put(settings),
    )
  }

  commitAnswer(batch: AnswerBatch): Promise<void> {
    return this.run(['progress', 'days', 'celebrations'], 'readwrite', (tx) => {
      tx.objectStore('progress').put(batch.progress)
      tx.objectStore('days').put(batch.day)
      for (const c of batch.celebrations) tx.objectStore('celebrations').put(c)
    })
  }

  putDay(day: DayStats): Promise<void> {
    return this.run(['days'], 'readwrite', (tx) => void tx.objectStore('days').put(day))
  }

  putCelebrations(recs: CelebrationRec[]): Promise<void> {
    return this.run(['celebrations'], 'readwrite', (tx) => {
      for (const c of recs) tx.objectStore('celebrations').put(c)
    })
  }

  resetProgress(now: number): Promise<void> {
    return this.run(['progress', 'days', 'celebrations'], 'readwrite', (tx) => {
      for (const name of ['progress', 'days', 'celebrations'] as const) {
        const store = tx.objectStore(name)
        const cursorReq = store.openCursor()
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result
          if (!cursor) return
          const rec = cursor.value as { deletedAt: number | null; updatedAt: number }
          if (isLive(rec)) cursor.update({ ...rec, deletedAt: now, updatedAt: now })
          cursor.continue()
        }
      }
    })
  }

  putUserSet(set: UserSet): Promise<void> {
    return this.run(['userSets'], 'readwrite', (tx) => void tx.objectStore('userSets').put(set))
  }

  putUserWords(words: UserWord[]): Promise<void> {
    return this.run(['userWords'], 'readwrite', (tx) => {
      for (const w of words) tx.objectStore('userWords').put(w)
    })
  }
}

/** Открывает IndexedDB. Бросает ошибку, если хранилище недоступно. */
export async function openIndexedDbRepository(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<Repository> {
  if (!factory) throw new Error('IndexedDB недоступна')
  return new IndexedDbRepository(await openDb(factory))
}

/** Для приложения: IndexedDB, а если её нет, хранилище в памяти (persistent = false, баннер B1). */
export async function openRepository(): Promise<Repository> {
  try {
    return await openIndexedDbRepository()
  } catch {
    return new MemoryRepository(false)
  }
}
