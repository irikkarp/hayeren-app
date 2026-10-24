import { progressCounts } from '../domain/progress'
import { FEATURES } from '../features'
import { useAppState, useStore } from '../store/context'
import { Khachkar } from '../ui/Icons'
import { ProgressBar, ProgressLine } from '../ui/Progress'

/** Раздел «Мои наборы» на главной (критерии 38–39, 43): список наборов, новые сверху. */
export function MySetsSection() {
  const store = useStore()
  const { userSets, progress } = useAppState()
  if (!FEATURES.userSets) return null
  const catalog = store.getCatalog()
  const sets = [...userSets].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <section className="stack" aria-labelledby="my-sets">
      <div className="section-head">
        <h2 className="t-head grow-1" id="my-sets">
          Мои наборы
        </h2>
        {sets.length > 0 && (
          <a className="btn btn-text" href="#/add">
            + Добавить слова
          </a>
        )}
      </div>

      {sets.length === 0 ? (
        <div className="empty">
          <Khachkar size={40} />
          <p>Добавьте слова, которые дал учитель</p>
          <a className="btn btn-primary btn-block" href="#/add">
            Добавить слова
          </a>
        </div>
      ) : (
        <ul className="list">
          {sets.map((set) => {
            const p = progressCounts(catalog.setWords(set.id), progress)
            return (
              <li className="row set-row" key={set.id}>
                <a className="set-main" href={`#/sets/${encodeURIComponent(set.id)}`}>
                  <span className="name">{set.title}</span>
                  {p.total === 0 ? (
                    <span className="muted t-small">0 слов</span>
                  ) : (
                    <>
                      <ProgressLine counts={p} />
                      <ProgressBar counts={p} label={`Набор «${set.title}»`} />
                    </>
                  )}
                </a>
                {p.total > 0 && (
                  <a
                    className="btn btn-secondary btn-sm"
                    href={`#/session/set/${encodeURIComponent(set.id)}`}
                    aria-label={`Учить набор «${set.title}»`}
                  >
                    Учить
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
