import { useState } from 'react'
import type { Mode } from '../domain/types'
import { navigate } from '../router'
import { useStore } from '../store/context'
import { Bird, Pattern } from '../ui/Icons'

const CHOICES: { mode: Mode; title: string; hint: string; sample: string }[] = [
  {
    mode: 'beginner',
    title: 'Учу армянский с нуля',
    hint: 'Под каждым словом будет транслитерация латиницей',
    sample: 'barev',
  },
  {
    mode: 'reader',
    title: 'Понимаю на слух, хочу научиться читать',
    hint: 'Транслитерация скрыта, её можно подсмотреть по кнопке',
    sample: '?',
  },
]

/** S01. Онбординг: один экран, выбор режима сразу сохраняется. */
export function Welcome() {
  const store = useStore()
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function choose(mode: Mode) {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await store.chooseMode(mode)
    setBusy(false)
    if (ok) navigate('/', { replace: true })
    else setFailed(true)
  }

  return (
    <>
      <div className="onb-hero">
        <Pattern />
        <Bird />
        <h1 className="t-display">Hayeren</h1>
        <p className="hy hy-body" lang="hy" aria-hidden="true">
          Հայերեն
        </p>
        <p className="t-small">Армянские слова за 5–10 минут в день</p>
      </div>
      <main className="screen" style={{ gap: 20 }}>
        <h2 className="t-heading">Как вы хотите заниматься?</h2>
        {failed && (
          <div className="banner banner-err" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>Не удалось сохранить выбор. Попробуйте ещё раз</span>
          </div>
        )}
        <div className="stack">
          {CHOICES.map((c) => (
            <button key={c.mode} type="button" className="choice" onClick={() => choose(c.mode)}>
              <span className="t-heading">{c.title}</span>
              <span className="muted t-small">{c.hint}</span>
              <span className="hy hy-body" lang="hy">
                բարև <span className="translit-sm">· {c.sample}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="muted t-small" style={{ textAlign: 'center' }}>
          Режим можно поменять в настройках
        </p>
      </main>
    </>
  )
}
