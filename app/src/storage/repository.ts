import type {
  CelebrationRec,
  DayStats,
  Settings,
  UserSet,
  UserWord,
  WordProgress,
} from '../domain/types'

/** Всё живое содержимое хранилища (без записей с deletedAt). */
export interface Snapshot {
  /** null — приложение открыто впервые, режим ещё не выбран. */
  settings: Settings | null
  progress: WordProgress[]
  days: DayStats[]
  celebrations: CelebrationRec[]
  userSets: UserSet[]
  userWords: UserWord[]
}

/** Всё, что меняется одним ответом: сохраняется атомарно. */
export interface AnswerBatch {
  progress: WordProgress
  day: DayStats
  celebrations: CelebrationRec[]
}

/**
 * Изменение своих наборов и слов одной атомарной записью (этап 2). Записи с `deletedAt` — это
 * мягкое удаление (надгробия). `deleteProgress` — слова, чьё состояние SRS нужно удалить вместе
 * с ними (критерии 41, 82).
 */
export interface UserDataBatch {
  sets: UserSet[]
  words: UserWord[]
  deleteProgress: string[]
  now: number
}

/**
 * Слой доступа к данным. Приложение работает только с этим интерфейсом, поэтому позже
 * (фича 003) можно добавить синхронизацию: у всех записей есть стабильные id, updatedAt и
 * deletedAt (мягкое удаление), а прогресс SRS лежит отдельно от слов.
 */
export interface Repository {
  /** false — данные живут только в памяти вкладки (хранилище браузера недоступно). */
  readonly persistent: boolean
  load(): Promise<Snapshot>
  putSettings(settings: Settings): Promise<void>
  commitAnswer(batch: AnswerBatch): Promise<void>
  putDay(day: DayStats): Promise<void>
  putCelebrations(recs: CelebrationRec[]): Promise<void>
  /** «Сбросить прогресс»: мягко удаляет состояния слов, дни и отметки; настройки и слова остаются. */
  resetProgress(now: number): Promise<void>
  putUserSet(set: UserSet): Promise<void>
  putUserWords(words: UserWord[]): Promise<void>
  /** Свои наборы и слова: добавление, изменение, мягкое удаление. Всё или ничего. */
  commitUserData(batch: UserDataBatch): Promise<void>
}

export const isLive = <T extends { deletedAt: number | null }>(r: T): boolean => r.deletedAt == null
