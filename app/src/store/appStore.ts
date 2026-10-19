import { buildCatalog, type Catalog } from '../domain/catalog'
import { noteAnswer, resolveSessionEnd } from '../domain/celebration'
import { toDateKey, type DateKey } from '../domain/dates'
import { buildQueue, NEW_BONUS, type SessionTarget } from '../domain/queue'
import {
  answer,
  createSession,
  type AnswerOutcome,
  type AnswerUpdate,
  type SessionState,
  type SessionStats,
  type Verdict,
} from '../domain/session'
import { computeStreak } from '../domain/stats'
import type {
  CelebrationMap,
  Content,
  DayMap,
  DayStats,
  Mode,
  ProgressMap,
  Settings,
  UserSet,
  UserWord,
} from '../domain/types'
import { MemoryRepository } from '../storage/memoryRepository'
import type { Repository } from '../storage/repository'

/** Итог только что законченной сессии: по нему рисуются экраны S04 и S04b. */
export interface SessionResult {
  target: SessionTarget
  stats: SessionStats
  stopped: boolean
  /** Серия до сессии: чтобы показать «Серия растёт». */
  streakBefore: number
  /** Темы, для которых показывается «Тема выучена» (пусто — обычный итог). */
  celebratedTopicIds: string[]
}

export interface AppState {
  phase: 'loading' | 'ready' | 'error'
  /** false — данные не сохранятся после закрытия вкладки (баннер B1). */
  persistent: boolean
  /** Сегодняшняя дата по локальному времени (обновляется при возврате в приложение). */
  today: DateKey
  /** null — режим ещё не выбран (онбординг). */
  settings: Settings | null
  progress: ProgressMap
  days: DayMap
  celebrations: CelebrationMap
  userSets: UserSet[]
  userWords: UserWord[]
  /** Последняя запись не удалась: данные живут только до конца сессии. */
  saveFailed: boolean
  lastResult: SessionResult | null
  /** Увеличивается, когда нужно начать сессию заново (например, «Учить ещё 10»). */
  sessionNonce: number
}

export interface AppDeps {
  openRepository: () => Promise<Repository>
  content: Content
  now?: () => Date
}

type Listener = () => void

/**
 * Состояние приложения в памяти + запись в Repository. Любое изменение сначала применяется
 * в памяти (интерфейс не ждёт диска), затем сохраняется; при сбое записи ставится saveFailed.
 */
export class AppStore {
  private state: AppState
  private repo: Repository = new MemoryRepository(false)
  private listeners = new Set<Listener>()
  private catalogCache: { userSets: UserSet[]; userWords: UserWord[]; value: Catalog } | null = null
  private readonly now: () => Date

  private readonly deps: AppDeps

  constructor(deps: AppDeps) {
    this.deps = deps
    this.now = deps.now ?? (() => new Date())
    this.state = {
      phase: 'loading',
      persistent: true,
      today: toDateKey(this.now()),
      settings: null,
      progress: {},
      days: {},
      celebrations: {},
      userSets: [],
      userWords: [],
      saveFailed: false,
      lastResult: null,
      sessionNonce: 0,
    }
  }

  // --- подписка для React (useSyncExternalStore) ---
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getState = (): AppState => this.state

  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  /** Каталог слов (встроенные + свои); пересчитывается только при изменении своих слов. */
  getCatalog(): Catalog {
    const { userSets, userWords } = this.state
    const c = this.catalogCache
    if (c && c.userSets === userSets && c.userWords === userWords) return c.value
    const value = buildCatalog(this.deps.content, userSets, userWords)
    this.catalogCache = { userSets, userWords, value }
    return value
  }

  get content(): Content {
    return this.deps.content
  }

  getToday(): DateKey {
    return toDateKey(this.now())
  }

  streak(state: AppState = this.state): number {
    return computeStreak(state.days, state.today)
  }

  // --- запуск ---
  async start(): Promise<void> {
    try {
      this.repo = await this.deps.openRepository()
    } catch {
      this.repo = new MemoryRepository(false)
    }
    try {
      const snap = await this.repo.load()
      this.set({
        phase: 'ready',
        persistent: this.repo.persistent,
        today: this.getToday(),
        settings: snap.settings,
        progress: Object.fromEntries(snap.progress.map((p) => [p.wordId, p])),
        days: Object.fromEntries(snap.days.map((d) => [d.date, d])),
        celebrations: Object.fromEntries(snap.celebrations.map((c) => [c.topicId, c])),
        userSets: snap.userSets,
        userWords: snap.userWords,
      })
    } catch {
      this.set({ phase: 'error' })
    }
  }

  /** Обновляет «сегодня» (возврат в приложение, переход через полночь). */
  refreshToday(): void {
    const today = this.getToday()
    if (today !== this.state.today) this.set({ today })
  }

  // --- запись ---
  private readonly pending = new Set<Promise<boolean>>()

  private persist(work: () => Promise<void>): Promise<boolean> {
    const task = (async () => {
      try {
        await work()
        return true
      } catch {
        this.set({ saveFailed: true })
        return false
      }
    })()
    this.pending.add(task)
    void task.finally(() => this.pending.delete(task))
    return task
  }

  /** Ждёт завершения всех запущенных записей (транзакций IndexedDB). */
  async whenSaved(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending])
  }

  private settingsRecord(mode: Mode): Settings {
    return { id: 'settings', mode, updatedAt: this.now().getTime(), deletedAt: null }
  }

  /** Онбординг: выбор режима. false — запись не удалась, выбор не применён (критерий S01). */
  async chooseMode(mode: Mode): Promise<boolean> {
    const settings = this.settingsRecord(mode)
    try {
      await this.repo.putSettings(settings)
    } catch {
      return false
    }
    this.set({ settings })
    return true
  }

  /** Смена режима в настройках; прогресс не меняется (критерий 34). */
  async setMode(mode: Mode): Promise<void> {
    const settings = this.settingsRecord(mode)
    this.set({ settings })
    await this.persist(() => this.repo.putSettings(settings))
  }

  /** Очередь новой сессии по текущему состоянию (чистое чтение, ничего не пишет). */
  startSession(target: SessionTarget): SessionState {
    const s = this.state
    const today = this.getToday()
    return createSession(
      buildQueue(target, {
        catalog: this.getCatalog(),
        progress: s.progress,
        today,
        day: s.days[today],
      }),
    )
  }

  /** Ответ на текущую карточку сессии: применяет правила SRS и сразу сохраняет результат. */
  answerCurrent(session: SessionState, verdict: Verdict): AnswerOutcome {
    const outcome = answer(session, verdict, {
      progress: this.state.progress,
      today: this.getToday(),
      now: this.now().getTime(),
    })
    if (outcome.update) this.commitAnswer(outcome.update)
    return outcome
  }

  /** Фиксирует ответ на карточку: состояние слова, день (серия, лимит новых), отметки тем. */
  commitAnswer(update: AnswerUpdate): void {
    const now = this.now().getTime()
    const today = this.getToday()
    const s = this.state
    const catalog = this.getCatalog()

    const progress = { ...s.progress, [update.progress.wordId]: update.progress }
    const prevDay = s.days[today]
    const day: DayStats = {
      date: today,
      answered: (prevDay?.answered ?? 0) + 1,
      newStarted: (prevDay?.newStarted ?? 0) + (update.wasNew ? 1 : 0),
      bonusNew: prevDay?.bonusNew ?? 0,
      updatedAt: now,
      deletedAt: null,
    }
    const word = catalog.byId.get(update.progress.wordId)
    const celebration = word
      ? noteAnswer({
          map: s.celebrations,
          catalog,
          progress,
          word,
          prevBox: update.prevBox,
          newBox: update.progress.box,
          now,
        })
      : { map: s.celebrations, changed: [] }

    this.set({
      today,
      progress,
      days: { ...s.days, [today]: day },
      celebrations: celebration.map,
    })
    void this.persist(() =>
      this.repo.commitAnswer({ progress: update.progress, day, celebrations: celebration.changed }),
    )
  }

  /**
   * Конец сессии: решает, показывать ли «Тема выучена» (критерии 126–128), помечает показанные
   * темы отпразднованными и запоминает итог для экрана результата.
   */
  finishSession(
    target: SessionTarget,
    stats: SessionStats,
    stopped: boolean,
    streakBefore: number,
  ) {
    const now = this.now().getTime()
    const s = this.state
    const end = resolveSessionEnd({
      map: s.celebrations,
      catalog: this.getCatalog(),
      progress: s.progress,
      now,
    })
    this.set({
      celebrations: end.map,
      lastResult: {
        target,
        stats,
        stopped,
        streakBefore,
        celebratedTopicIds: end.shown.map((t) => t.id),
      },
    })
    if (end.changed.length > 0) void this.persist(() => this.repo.putCelebrations(end.changed))
  }

  clearResult(): void {
    if (this.state.lastResult) this.set({ lastResult: null })
  }

  /** «Учить ещё 10 новых слов»: поднимает сегодняшний лимит на 10 (критерий 19). */
  addBonusNew(): void {
    const now = this.now().getTime()
    const today = this.getToday()
    const prev = this.state.days[today]
    const day: DayStats = {
      date: today,
      answered: prev?.answered ?? 0,
      newStarted: prev?.newStarted ?? 0,
      bonusNew: (prev?.bonusNew ?? 0) + NEW_BONUS,
      updatedAt: now,
      deletedAt: null,
    }
    this.set({ today, days: { ...this.state.days, [today]: day } })
    void this.persist(() => this.repo.putDay(day))
  }

  /** Заставляет экран сессии построить очередь заново. */
  restartSession(): void {
    this.set({ sessionNonce: this.state.sessionNonce + 1, lastResult: null })
  }

  /** «Сбросить прогресс»: состояния слов, серия и отметки «Тема выучена»; режим и слова остаются. */
  async resetProgress(): Promise<void> {
    this.set({ progress: {}, days: {}, celebrations: {}, lastResult: null })
    await this.persist(() => this.repo.resetProgress(this.now().getTime()))
  }
}
