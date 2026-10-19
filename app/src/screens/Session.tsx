import { useEffect, useRef, useState } from 'react'
import { canLearnMore, type SessionTarget } from '../domain/queue'
import {
  currentItem,
  dropMissing,
  feedbackText,
  isFinished,
  sessionProgress,
  sessionStats,
  type SessionState,
  type Verdict,
} from '../domain/session'
import type { CardWord } from '../domain/types'
import { navigate, goBack } from '../router'
import { useAppState, useStore } from '../store/context'
import { HeroWord } from '../ui/HeroWord'
import { Khachkar } from '../ui/Icons'
import { Progress } from '../ui/Progress'
import { Redirect } from '../ui/Redirect'
import { useToast } from '../ui/toastContext'

function Translit({ word }: { word: CardWord }) {
  return (
    <p className="translit">
      {word.translit}
      {word.translitAuto && (
        <>
          {' '}
          <span className="chip chip-auto">авто</span>
        </>
      )}
    </p>
  )
}

/** S05. Нет карточек для сессии: сразу при запуске очередь пуста. */
function NoCards({ target }: { target: SessionTarget }) {
  const store = useStore()
  const state = useAppState()
  const catalog = store.getCatalog()
  const ctx = {
    catalog,
    progress: state.progress,
    today: state.today,
    day: state.days[state.today],
  }
  const limitReached = canLearnMore(target, ctx)

  function learnMore() {
    store.addBonusNew()
    store.restartSession()
  }

  return (
    <>
      <header className="appbar">
        <button type="button" className="icon-btn" aria-label="Назад" onClick={goBack}>
          ‹
        </button>
      </header>
      <main className="screen">
        <div className="empty">
          <Khachkar size={40} />
          <h1 className="t-heading">
            {limitReached
              ? 'На сегодня новых слов достаточно. Возвращайтесь завтра'
              : 'В этой теме нечего повторять сегодня'}
          </h1>
          {limitReached && (
            <button type="button" className="btn btn-primary btn-block" onClick={learnMore}>
              Учить ещё 10 новых слов
            </button>
          )}
          <button
            type="button"
            className={`btn btn-block ${limitReached ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => navigate('/', { replace: true })}
          >
            К темам
          </button>
        </div>
      </main>
    </>
  )
}

/** Сессия по теме, набору или общее повторение. Экран пересоздаётся (key), если нужна новая очередь. */
export function SessionScreen({ target }: { target: SessionTarget }) {
  const store = useStore()
  const [init] = useState(() => ({
    session: store.startSession(target),
    streakBefore: store.streak(),
  }))
  const known =
    target.type === 'review' ||
    (target.type === 'topic' && store.getCatalog().topics.some((t) => t.id === target.topicId)) ||
    (target.type === 'set' && store.getCatalog().setWords(target.setId).length > 0)

  if (!known) return <Redirect to="/" />
  if (init.session.queue.length === 0) {
    // Общая сессия с пустой очередью (критерий 120): остаёмся на главной без сообщений.
    return target.type === 'review' ? <Redirect to="/" /> : <NoCards target={target} />
  }
  return <Run target={target} initial={init.session} streakBefore={init.streakBefore} />
}

function Run({
  target,
  initial,
  streakBefore,
}: {
  target: SessionTarget
  initial: SessionState
  streakBefore: number
}) {
  const store = useStore()
  const state = useAppState()
  const toast = useToast()
  const [session, setSession] = useState(initial)
  const [flipped, setFlipped] = useState(false)
  const [hintShown, setHintShown] = useState(false)
  const finished = useRef(false)
  const saving = useRef(false)
  const showRef = useRef<HTMLButtonElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)

  const catalog = store.getCatalog()
  // Слова, удалённые во время сессии, пропускаются без сообщения (критерий 82).
  const view = dropMissing(session, new Set(catalog.words.map((w) => w.id)))
  const item = currentItem(view)
  const word = item ? catalog.byId.get(item.wordId) : undefined
  const mode = state.settings?.mode ?? 'beginner'

  function finish(s: SessionState, stopped: boolean) {
    if (finished.current) return
    finished.current = true
    store.finishSession(target, sessionStats(s), stopped, streakBefore)
    navigate('/session/result', { replace: true })
  }

  // Тост не должен переживать экран сессии: на итоге он закрывал бы кнопки.
  useEffect(() => toast.dismiss, [toast])

  async function onAnswer(verdict: Verdict) {
    if (!flipped || finished.current || saving.current) return
    const outcome = store.answerCurrent(view, verdict)
    toast.show(feedbackText(outcome.feedback))
    setFlipped(false)
    setHintShown(false)
    // Дожидаемся записи в IndexedDB до следующей карточки, чтобы ответ не потерялся при закрытии.
    saving.current = true
    await store.whenSaved()
    saving.current = false
    if (isFinished(outcome.session)) finish(outcome.session, false)
    else setSession(outcome.session)
  }

  // Фокус: на новой карточке — на «Показать ответ», после ответа — на блок ответа (его читает скринридер).
  const cardKey = item ? `${item.wordId}:${item.kind}` : ''
  useEffect(() => {
    if (!flipped) showRef.current?.focus()
  }, [cardKey, flipped])
  useEffect(() => {
    if (flipped) answerRef.current?.focus()
  }, [flipped])
  useEffect(() => {
    if (hintShown) hintRef.current?.focus()
  }, [hintShown])

  // Клавиатура на десктопе: Пробел/Enter — ответ; ← «Не знаю», → «Знаю».
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setFlipped(true)
      } else if (flipped && e.key === 'ArrowRight') void onAnswer('know')
      else if (flipped && e.key === 'ArrowLeft') void onAnswer('dont')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!item) finish(view, false)
  })

  if (!item || !word) return null

  const { done, total, left } = sessionProgress(view)
  const chip =
    item.kind === 'new'
      ? { cls: 'chip chip-info', text: 'Новое слово' }
      : item.kind === 'again'
        ? { cls: 'chip', text: 'Ещё раз' }
        : { cls: 'chip', text: 'Повторение' }

  return (
    <>
      <div className="session-top">
        <button type="button" className="icon-btn" onClick={() => finish(view, true)}>
          Завершить
        </button>
        <span className="count">Осталось: {left}</span>
        <span style={{ minWidth: 44 }} />
      </div>
      <div className="session-body">
        <Progress value={done} max={total} label={`Пройдено ${done} из ${total}`} />
        {state.saveFailed && (
          <div className="banner banner-err" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>Не удалось сохранить ответ. Он будет учтён только до конца сессии.</span>
          </div>
        )}
        <div className="word-card" style={flipped ? { gap: 10 } : undefined}>
          <span className={chip.cls}>{chip.text}</span>
          <HeroWord hy={word.hy} />
          {!flipped && mode === 'beginner' && <Translit word={word} />}
          {!flipped && mode === 'reader' && !hintShown && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setHintShown(true)}
            >
              Подсказка
            </button>
          )}
          {!flipped && mode === 'reader' && hintShown && (
            <div ref={hintRef} tabIndex={-1} className="answer-focus" aria-live="polite">
              <Translit word={word} />
            </div>
          )}
          {flipped && (
            <div
              ref={answerRef}
              tabIndex={-1}
              className="answer-focus stack"
              style={{ alignItems: 'center', width: '100%', gap: 10 }}
              aria-live="polite"
            >
              <Translit word={word} />
              <Khachkar size={28} className="khach rule" />
              <p className="ru">{word.ru}</p>
              {word.exampleHy && (
                <div className="example">
                  <span className="cap">Пример</span>
                  <span className="hy hy-body" lang="hy">
                    {word.exampleHy}
                  </span>
                  {word.exampleRu && <span className="muted">{word.exampleRu}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="stickybar is-session">
        {!flipped ? (
          <button
            type="button"
            ref={showRef}
            className="btn btn-primary btn-block"
            onClick={() => setFlipped(true)}
          >
            Показать ответ
          </button>
        ) : (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-answer-no"
              onClick={() => void onAnswer('dont')}
            >
              <span aria-hidden="true">↺</span> Не знаю
            </button>
            <button type="button" className="btn btn-success" onClick={() => void onAnswer('know')}>
              <span aria-hidden="true">✓</span> Знаю
            </button>
          </div>
        )}
      </div>
    </>
  )
}
