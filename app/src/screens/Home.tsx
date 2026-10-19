import { useMemo } from 'react'
import { FEATURES } from '../features'
import { wordsWord } from '../domain/plural'
import { SESSION_DUE_LIMIT } from '../domain/queue'
import { countDue, hasAnyProgress, learnedCount, topicProgress } from '../domain/stats'
import { streakView } from '../domain/streak'
import { navigate } from '../router'
import { useAppState, useStore } from '../store/context'
import { Bird, Pattern, Pomegranate, PomegranateOutline, TopicIcon } from '../ui/Icons'
import { Progress } from '../ui/Progress'

const POM_SIZES = [16, 22, 28, 34, 40]

/** Серия: пять ячеек-гранатов и текст (критерии 139–147). Место под ячейки зарезервировано (кроме серии 0). */
function StreakTile({ days }: { days: number }) {
  const view = streakView(days)
  // Серия 0: одна штриховая ячейка, текст занимает остальную ширину (дизайн S02, `.is-empty`).
  const empty = view.filled === 0
  return (
    <div className={`growth${empty ? ' is-empty' : ''}`} role="group" aria-label={view.ariaLabel}>
      <div className="trees" aria-hidden="true">
        {empty ? (
          <PomegranateOutline size={30} />
        ) : (
          POM_SIZES.map((size, i) => {
            const n = i + 1
            if (n <= view.filled) return <Pomegranate key={n} size={size} />
            if (n === view.next) return <PomegranateOutline key={n} size={Math.max(size - 2, 22)} />
            return <span key={n} style={{ width: size, flex: 'none' }} />
          })
        )}
      </div>
      <div>
        <b>{view.title}</b>
        <span className="sub">{view.sub}</span>
      </div>
    </div>
  )
}

/** Раздел «Мои наборы» (этап 2, критерии 38–43): место на главной зарезервировано, пока скрыт. */
function MySetsSection() {
  if (!FEATURES.userSets) return null
  return null
}

/** S02. Главная: серия, статистика, «Повторить (N)», темы. */
export function Home() {
  const store = useStore()
  const state = useAppState()
  const catalog = store.getCatalog()
  const { progress, today } = state

  // N на плитке и на кнопке: одно и то же значение из одной функции (критерий 112).
  const due = useMemo(() => countDue(catalog, progress, today), [catalog, progress, today])
  const learned = useMemo(() => learnedCount(catalog, progress), [catalog, progress])
  const anyProgress = useMemo(() => hasAnyProgress(catalog, progress), [catalog, progress])
  const streak = store.streak(state)

  const note =
    due === 0
      ? anyProgress
        ? 'На сегодня всё повторено'
        : 'Пока нечего повторять: начните с любой темы'
      : due > SESSION_DUE_LIMIT
        ? 'В сессии 30 слов, остальные — в следующей'
        : null

  function startReview() {
    store.refreshToday()
    // Очередь могла опустеть к моменту нажатия (критерий 120): остаёмся на главной без сообщений.
    if (store.startSession({ type: 'review' }).queue.length === 0) return
    navigate('/session/review')
  }

  return (
    <>
      <header className="hdr">
        <Pattern />
        <Bird className="logo" />
        <div>
          <h1 className="brand">Hayeren</h1>
          <div className="brand-hy" lang="hy" aria-hidden="true">
            Հայերեն
          </div>
        </div>
      </header>
      <main className="screen">
        <StreakTile days={streak} />

        <div className="stats" role="group" aria-label="Ваш прогресс">
          <div className="surface stat">
            <span className="label">Выучено</span>
            <span className="t-stat">{learned}</span>
            <span className="sub">из {catalog.words.length}</span>
          </div>
          <div className="surface stat">
            <span className="label">Повторить сегодня</span>
            <span className="t-stat">{due}</span>
            <span className="sub">{wordsWord(due)}</span>
          </div>
        </div>

        <div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={due === 0}
            aria-describedby={note ? 'review-note' : undefined}
            onClick={startReview}
          >
            Повторить ({due})
          </button>
          {note && (
            <p className="repeat-note" id="review-note">
              {note}
            </p>
          )}
        </div>

        <h2 className="t-head">Темы</h2>
        <ul className="list">
          {catalog.topics.map((topic) => {
            const p = topicProgress(catalog, topic.id, progress)
            return (
              <li key={topic.id}>
                <a className="row" href={`#/session/topic/${topic.id}`}>
                  <span className="tile">
                    <TopicIcon topicId={topic.id} />
                  </span>
                  <span className="grow">
                    <span className="name">{topic.title_ru}</span>
                    <span className="muted t-small">
                      выучено {p.learned} из {p.total}
                    </span>
                    <Progress
                      value={p.learned}
                      max={p.total}
                      label={`Выучено ${p.learned} из ${p.total}`}
                    />
                  </span>
                  {p.isLearned ? (
                    <span className="chip chip-ok">✓ Выучена</span>
                  ) : (
                    <span className="chev" aria-hidden="true">
                      ›
                    </span>
                  )}
                </a>
              </li>
            )
          })}
        </ul>

        <MySetsSection />
      </main>
    </>
  )
}
