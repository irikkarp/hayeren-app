import { buildCatalog, type Catalog } from '../domain/catalog'
import { noteAnswer, resolveSessionEnd } from '../domain/celebration'
import { toDateKey, type DateKey } from '../domain/dates'
import { buildQueue, NEW_BONUS, type SessionTarget } from '../domain/queue'
import {
  answer,
  createSession,
  type AnswerOutcome,
  type AnswerUpdate,
  type NewWordsStats,
  type SessionState,
  type SessionStats,
  type Verdict,
} from '../domain/session'
import type { Delimiter } from '../domain/csv'
import type { Mapping } from '../domain/importFile'
import type { ParseOutput } from '../domain/parsedRows'
import type { SavePlan } from '../domain/preview'
import { buildExportFile, type ExportFile } from '../domain/exportCsv'
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
import { saveTextFile, type SaveFile } from '../platform/saveFile'
import { MemoryRepository } from '../storage/memoryRepository'
import type { Repository, UserDataBatch } from '../storage/repository'
import { editUserWord } from '../domain/userWords'
import { validateSetTitle, type SetTitleError, type WordInput } from '../domain/wordValidation'
import { normalizeText } from '../domain/text'

/** Итог только что законченной сессии: по нему рисуются экраны S04 и S04b. */
export interface SessionResult {
  target: SessionTarget
  stats: SessionStats
  /** Новые слова, получившие состояние в сессии (пояснение в итоге, критерий 154). */
  newWords: NewWordsStats
  stopped: boolean
  /** Серия до сессии: чтобы показать «Серия растёт». */
  streakBefore: number
  /** Темы, для которых показывается «Тема выучена» (пусто — обычный итог). */
  celebratedTopicIds: string[]
}

export type RenameResult = 'ok' | 'failed' | 'unchanged' | SetTitleError

/** Прочитанный файл импорта (таблица строк) до сопоставления колонок. */
export interface ImportedFile {
  name: string
  /** Имя листа xlsx (первого); у CSV null. */
  sheetName: string | null
  /** В xlsx больше одного листа: показывается уведомление (критерий 73). */
  multiSheet: boolean
  rows: string[][]
  /** Исходный текст CSV (нужен, чтобы перечитать с другим разделителем); у xlsx null. */
  csvText: string | null
  /** Разделитель CSV, с которым прочитан файл; у xlsx null. */
  delimiter: Delimiter | null
  /** Выбор разделителя на S14 ('auto' или конкретный); по умолчанию 'auto'. */
  delimiterChoice?: 'auto' | Delimiter
}

/** Результат разбора для экрана предпросмотра (S11). */
export interface PreviewSource {
  source: 'paste' | 'file'
  fileName: string | null
  parsed: ParseOutput
}

/**
 * Незавершённый ввод при добавлении слов (S10 → S11, S13 → S14 → S11): держится в памяти,
 * пока пользователь не вышел из потока, чтобы «Назад» не терял данные (критерии 44, 64).
 */
export interface AddFlow {
  pasteText: string
  file: ImportedFile | null
  mapping: Mapping | null
  preview: PreviewSource | null
}

export const emptyAddFlow = (): AddFlow => ({
  pasteText: '',
  file: null,
  mapping: null,
  preview: null,
})

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
  /** Время последнего успешного экспорта (мс) или null (критерий 98). */
  lastBackupAt: number | null
  addFlow: AddFlow
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
  /** Сохранение файла экспорта; по умолчанию — загрузка через браузер (platform/saveFile). */
  saveFile?: SaveFile
}

/** Итог экспорта (критерии 89, 99). */
export type ExportResult =
  { status: 'ok'; file: ExportFile } | { status: 'empty' | 'cancelled' | 'failed' }

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
      lastBackupAt: null,
      addFlow: emptyAddFlow(),
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

  /** Текущий момент по часам приложения (для названия набора «Набор от ДД.ММ»). */
  getNowDate(): Date {
    return this.now()
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
        lastBackupAt: snap.lastBackupAt,
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
    newWords: NewWordsStats,
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
        newWords,
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

  // --- свои наборы и слова (этап 2) ---

  /**
   * Записывает изменение своих наборов и слов, затем обновляет состояние. false — запись не
   * удалась, состояние не менялось (экран показывает ошибку и сохраняет ввод пользователя).
   */
  private async commitUserData(batch: Omit<UserDataBatch, 'now'>): Promise<boolean> {
    const now = this.now().getTime()
    try {
      await this.repo.commitUserData({ ...batch, now })
    } catch {
      return false
    }
    const merge = <T extends { id: string; deletedAt: number | null }>(list: T[], changed: T[]) => {
      const byId = new Map(list.map((r) => [r.id, r]))
      for (const r of changed) {
        if (r.deletedAt == null) byId.set(r.id, r)
        else byId.delete(r.id)
      }
      return [...byId.values()]
    }
    const gone = new Set(batch.deleteProgress)
    const progress = gone.size
      ? Object.fromEntries(Object.entries(this.state.progress).filter(([id]) => !gone.has(id)))
      : this.state.progress
    this.set({
      userSets: merge(this.state.userSets, batch.sets),
      userWords: merge(this.state.userWords, batch.words),
      progress,
    })
    return true
  }

  /** Просит у браузера постоянное хранилище при первом сохранении своих слов (критерий 85). */
  private requestPersistentStorage(): void {
    try {
      void navigator.storage?.persist?.().catch(() => {})
    } catch {
      // отказ или отсутствие API ничему не мешает
    }
  }

  /** Сохраняет новые слова и наборы одной операцией (вставка, форма, импорт). */
  async saveUserWords(plan: SavePlan): Promise<boolean> {
    const first = this.state.userWords.length === 0
    const ok = await this.commitUserData({
      sets: plan.newSets,
      words: plan.words,
      deleteProgress: [],
    })
    if (ok && first) this.requestPersistentStorage()
    return ok
  }

  /** Переименование набора; ошибка названия возвращается, а не бросается. */
  async renameSet(setId: string, title: string): Promise<RenameResult> {
    const set = this.state.userSets.find((s) => s.id === setId)
    if (!set) return 'failed'
    const others = this.state.userSets.filter((s) => s.id !== setId).map((s) => s.title)
    const error = validateSetTitle(title, others)
    if (error) return error
    const next = normalizeText(title)
    if (next === set.title) return 'unchanged'
    const ok = await this.commitUserData({
      sets: [{ ...set, title: next, updatedAt: this.now().getTime() }],
      words: [],
      deleteProgress: [],
    })
    return ok ? 'ok' : 'failed'
  }

  /** Удаляет набор, его слова и их состояния SRS (критерий 41). */
  async deleteSet(setId: string): Promise<boolean> {
    const set = this.state.userSets.find((s) => s.id === setId)
    if (!set) return true
    const now = this.now().getTime()
    const words = this.state.userWords.filter((w) => w.setId === setId)
    return this.commitUserData({
      sets: [{ ...set, deletedAt: now, updatedAt: now }],
      words: words.map((w) => ({ ...w, deletedAt: now, updatedAt: now })),
      deleteProgress: words.map((w) => w.id),
    })
  }

  /** Изменение слова; состояние SRS не трогается (критерий 81). */
  async updateWord(wordId: string, input: WordInput): Promise<boolean> {
    const word = this.state.userWords.find((w) => w.id === wordId)
    if (!word) return false
    return this.commitUserData({
      sets: [],
      words: [editUserWord(word, input, this.now().getTime())],
      deleteProgress: [],
    })
  }

  /** Удаляет слово и его состояние SRS (критерий 82). */
  async deleteWord(wordId: string): Promise<boolean> {
    const word = this.state.userWords.find((w) => w.id === wordId)
    if (!word) return true
    const now = this.now().getTime()
    return this.commitUserData({
      sets: [],
      words: [{ ...word, deletedAt: now, updatedAt: now }],
      deleteProgress: [wordId],
    })
  }

  // --- незавершённый ввод ---
  setAddFlow(patch: Partial<AddFlow>): void {
    this.set({ addFlow: { ...this.state.addFlow, ...patch } })
  }
  resetAddFlow(): void {
    this.set({ addFlow: emptyAddFlow() })
  }

  /** «Сбросить прогресс»: состояния слов, серия и отметки «Тема выучена»; режим и слова остаются. */
  async resetProgress(): Promise<void> {
    this.set({ progress: {}, days: {}, celebrations: {}, lastResult: null })
    await this.persist(() => this.repo.resetProgress(this.now().getTime()))
  }

  /**
   * Экспорт своих слов в CSV (критерии 88–100): все наборы или один (`setId`). Вызывать прямо из
   * обработчика нажатия: файл собирается и передаётся браузеру до первого `await` (нужно iOS).
   * Дата последней копии обновляется только после успешной передачи файла.
   */
  async exportWords(setId?: string): Promise<ExportResult> {
    const file = buildExportFile(
      this.state.userSets,
      this.state.userWords,
      this.getNowDate(),
      setId,
    )
    if (!file) return { status: 'empty' }
    try {
      const outcome = await (this.deps.saveFile ?? saveTextFile)(file.fileName, file.text)
      if (outcome === 'cancelled') return { status: 'cancelled' }
    } catch {
      return { status: 'failed' }
    }
    const at = this.now().getTime()
    this.set({ lastBackupAt: at })
    await this.persist(() => this.repo.putLastBackup(at))
    return { status: 'ok', file }
  }
}
