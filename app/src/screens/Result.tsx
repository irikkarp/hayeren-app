import { useEffect, useRef, useState } from 'react'
import { pickNextTopic } from '../domain/celebration'
import { daysWord } from '../domain/plural'
import { canLearnMore, SESSION_DUE_LIMIT } from '../domain/queue'
import { buildExplain, nextReviewDate, progressCounts } from '../domain/progress'
import { countDue } from '../domain/stats'
import { targetPath } from '../domain/router'
import { navigate } from '../router'
import { useAppState, useStore } from '../store/context'
import { Khachkar, Bird, Pattern, Pomegranate } from '../ui/Icons'
import { Redirect } from '../ui/Redirect'

function Tiles({ passed, know, dont }: { passed: number; know: number; dont: number }) {
  return (
    <div className="tiles" role="group" aria-label="Итог сессии">
      <div className="surface tile-n">
        <b>{passed}</b>
        <span>Пройдено</span>
      </div>
      <div className="surface tile-n">
        <b>{know}</b>
        <span>Знаю</span>
      </div>
      <div className="surface tile-n">
        <b>{dont}</b>
        <span>Не знаю</span>
      </div>
    </div>
  )
}

/**
 * S04 «Итог сессии» и S04b «Тема выучена». Данные берутся из итога последней сессии в памяти:
 * после обновления страницы итога нет, и пользователь попадает на главную (критерий 137).
 */
export function Result() {
  const store = useStore()
  const state = useAppState()
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Итог забирается один раз и очищается в хранилище: «Вперёд» по истории не покажет его снова.
  const [result] = useState(() => store.getState().lastResult)

  useEffect(() => {
    store.clearResult()
    headingRef.current?.focus()
  }, [store])

  if (!result) return <Redirect to="/" />

  const catalog = store.getCatalog()
  const { progress, today } = state
  const { stats, target, stopped } = result
  const streak = store.streak(state)
  const all = progressCounts(catalog.words, progress)
  const learned = all.learned
  const total = all.total
  const celebrated = result.celebratedTopicIds
    .map((id) => catalog.topics.find((t) => t.id === id))
    .filter((t) => t !== undefined)
  const win = celebrated.length > 0

  const streakTitle = `${streak} ${daysWord(streak)} подряд`
  const streakLine =
    streak > result.streakBefore ? `Серия растёт: ${streakTitle}` : `Серия: ${streakTitle}`
  const home = () => navigate('/', { replace: true })

  if (win) {
    const next = pickNextTopic(catalog, progress, result.celebratedTopicIds)
    const goNext = () => {
      if (!next) return
      store.restartSession()
      navigate(`/session/topic/${next.id}`, { replace: true })
    }
    return (
      <main className="win">
        <Pattern />
        <div className="summary">
          <Bird />
          <h1 className="t-title" tabIndex={-1} ref={headingRef}>
            {celebrated.length > 1 ? 'Темы выучены!' : 'Тема выучена!'}
          </h1>
          <div>
            {celebrated.map((t) => {
              const p = progressCounts(catalog.topicWords(t.id), progress)
              return (
                <p className="muted" key={t.id}>
                  {t.title_ru}: выучено {p.learned} из {p.total}
                </p>
              )
            })}
          </div>
          <div>
            <p className="hy hy-body" lang="hy">
              Շատ լավ
            </p>
            <p className="translit-sm">shat lav · очень хорошо</p>
          </div>
          <div className="grown" aria-hidden="true">
            <Pomegranate size={40} />
            <Pomegranate size={56} />
            <Pomegranate size={72} />
          </div>
          <Tiles {...stats} />
          <p className="t-small muted">
            Всего выучено: {learned} из {total}
            {streak > 0 && ` · Серия: ${streakTitle}`}
          </p>
          <div className="actions">
            {next ? (
              <>
                <button type="button" className="btn btn-primary btn-block" onClick={goNext}>
                  Следующая тема: {next.title_ru}
                </button>
                <button type="button" className="btn btn-secondary btn-block" onClick={home}>
                  К темам
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-block" onClick={home}>
                К темам
              </button>
            )}
          </div>
        </div>
      </main>
    )
  }

  // Обычный итог S04.
  const isReview = target.type === 'review'
  const dueLeft = countDue(catalog, progress, today)
  const day = state.days[today]
  const targetWordsList =
    target.type === 'topic'
      ? catalog.topicWords(target.topicId)
      : target.type === 'set'
        ? catalog.setWords(target.setId)
        : []
  const targetTitle =
    target.type === 'topic'
      ? (catalog.topics.find((t) => t.id === target.topicId)?.title_ru ?? '')
      : target.type === 'set'
        ? (state.userSets.find((u) => u.id === target.setId)?.title ?? '')
        : ''
  const explain = buildExplain({
    isReview,
    newCount: result.newWords.count,
    newKnow: result.newWords.know,
    dueLeft,
    nextDate: nextReviewDate(catalog.words, progress),
    today,
    remainingNew: progressCounts(targetWordsList, progress).notStarted,
    targetKind: target.type === 'set' ? 'set' : 'topic',
    targetTitle,
  })
  const more = !isReview && canLearnMore(target, { catalog, progress, today, day })

  function repeatMore() {
    store.restartSession()
    navigate('/session/review', { replace: true })
  }
  function learnMore() {
    store.addBonusNew()
    store.restartSession()
    navigate(targetPath(target), { replace: true })
  }

  return (
    <main className="summary">
      <Khachkar size={48} className="khach is-primary" />
      <h1 className="t-title" tabIndex={-1} ref={headingRef}>
        {stopped ? 'Сессия остановлена' : 'Хорошая работа!'}
      </h1>
      <Tiles {...stats} />
      {streak > 0 && stats.passed > 0 && <p>{streakLine}</p>}
      {isReview && dueLeft > 0 && <p className="muted">Осталось повторить: {dueLeft}</p>}
      {(explain.lead || explain.next.length > 0) && (
        <div className="explain">
          {explain.lead && (
            <div>
              <p className="lead">
                <i className="sw-i" aria-hidden="true" />
                {explain.lead.title}
              </p>
              <p>{explain.lead.detail}</p>
            </div>
          )}
          {explain.next.length > 0 && (
            <div className={`next${explain.lead ? '' : ' is-solo'}`}>
              {explain.next.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="actions">
        {isReview ? (
          dueLeft > 0 && stats.passed > 0 ? (
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={repeatMore}>
                Повторить ещё ({dueLeft})
              </button>
              {dueLeft > SESSION_DUE_LIMIT && (
                <p className="repeat-note">В сессии 30 слов, остальные — в следующей</p>
              )}
              <button type="button" className="btn btn-secondary btn-block" onClick={home}>
                На главную
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-block" onClick={home}>
              На главную
            </button>
          )
        ) : (
          <>
            <button type="button" className="btn btn-primary btn-block" onClick={home}>
              К темам
            </button>
            {more && (
              <button type="button" className="btn btn-secondary btn-block" onClick={learnMore}>
                Учить ещё 10 новых слов
              </button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
