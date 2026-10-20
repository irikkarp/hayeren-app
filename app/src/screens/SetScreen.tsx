import { useState } from 'react'
import { addPath } from '../domain/router'
import { wordsWord } from '../domain/plural'
import { setProgress } from '../domain/stats'
import { STATUS_LABEL, wordStatus } from '../domain/userWords'
import { navigate } from '../router'
import { useAppState, useStore } from '../store/context'
import { ConfirmDialog } from '../ui/Dialog'
import { Khachkar } from '../ui/Icons'
import { Redirect } from '../ui/Redirect'
import { RenameDialog } from '../ui/RenameDialog'
import { TopBar } from '../ui/TopBar'
import { useToast } from '../ui/toastContext'

/** S08. Экран набора: сводка, «Учить», «Добавить слова», управление, список слов (критерии 41–43, 80). */
export function SetScreen({ setId }: { setId: string }) {
  const store = useStore()
  const { userSets, progress } = useAppState()
  const toast = useToast()
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const set = userSets.find((s) => s.id === setId)
  if (!set) return <Redirect to="/" />

  const catalog = store.getCatalog()
  const words = catalog.setWords(setId)
  const p = setProgress(catalog, setId, progress)
  const hasAuto = words.some((w) => w.translitAuto)
  const addHref = `#${addPath('', setId)}`

  async function remove() {
    setDialog(null)
    if (await store.deleteSet(setId)) {
      navigate('/', { replace: true })
      toast.show('Набор удалён')
    } else toast.show('Не удалось удалить набор. Попробуйте ещё раз')
  }

  async function rename(title: string) {
    const res = await store.renameSet(setId, title)
    if (res === 'failed') {
      toast.show('Не удалось переименовать набор. Попробуйте ещё раз')
      setDialog(null)
      return null
    }
    if (res === 'ok' || res === 'unchanged') {
      setDialog(null)
      if (res === 'ok') toast.show('Набор переименован')
      return null
    }
    return res
  }

  return (
    <>
      <TopBar title={set.title} onBack={() => navigate('/')} />
      <main className="screen">
        <p>
          {p.total === 0 ? '0 слов' : `${p.total} ${wordsWord(p.total)} · выучено ${p.learned}`}
        </p>

        {p.total > 0 && (
          <a
            className="btn btn-primary btn-block"
            href={`#/session/set/${encodeURIComponent(setId)}`}
          >
            Учить
          </a>
        )}
        {p.total > 0 && (
          <a className="btn btn-secondary btn-block" href={addHref}>
            Добавить слова
          </a>
        )}

        <section className="stack" aria-label="Управление набором" style={{ gap: 0 }}>
          <button type="button" className="btn btn-text" onClick={() => setDialog('rename')}>
            Переименовать
          </button>
          <button type="button" className="btn btn-danger-text" onClick={() => setDialog('delete')}>
            Удалить набор
          </button>
        </section>

        {words.length === 0 ? (
          <div className="empty">
            <Khachkar size={40} />
            <p>В наборе пока нет слов</p>
            <a className="btn btn-primary btn-block" href={addHref}>
              Добавить слова
            </a>
          </div>
        ) : (
          <>
            <h2 className="t-head">Слова</h2>
            {hasAuto && (
              <p className="hint">
                Метка «авто»: транслитерация создана автоматически и может быть неточной. Её можно
                исправить в слове.
              </p>
            )}
            <ul className="list">
              {words.map((w) => {
                const status = wordStatus(progress[w.id]?.box)
                return (
                  <li key={w.id}>
                    <a
                      className="row word-row"
                      href={`#/sets/${encodeURIComponent(setId)}/words/${encodeURIComponent(w.id)}`}
                    >
                      <span className="grow">
                        <span className="line">
                          <span className="hy hy-list" lang="hy">
                            {w.hy}
                          </span>
                          {w.translit && <span className="translit-sm">{w.translit}</span>}
                          {w.translitAuto && <span className="chip chip-auto">авто</span>}
                        </span>
                        <span>{w.ru}</span>
                      </span>
                      <span
                        className={`chip${status === 'learned' ? ' chip-ok' : status === 'new' ? ' chip-info' : ''}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </main>

      {dialog === 'delete' && (
        <ConfirmDialog
          title={
            p.total > 0
              ? `Удалить набор «${set.title}» и ${p.total} ${wordsWord(p.total)}? Прогресс по ним будет потерян.`
              : `Удалить набор «${set.title}»?`
          }
          confirmLabel="Удалить"
          danger
          onConfirm={remove}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'rename' && (
        <RenameDialog title={set.title} onSave={rename} onCancel={() => setDialog(null)} />
      )}
    </>
  )
}
