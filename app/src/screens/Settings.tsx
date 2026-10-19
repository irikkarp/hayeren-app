import { useState } from 'react'
import pkg from '../../package.json'
import type { Mode } from '../domain/types'
import { useAppState, useStore } from '../store/context'
import { ConfirmDialog } from '../ui/Dialog'
import { useToast } from '../ui/toastContext'

const MODES: { mode: Mode; name: string; hint: string }[] = [
  { mode: 'beginner', name: 'Учу с нуля', hint: 'Транслитерация видна сразу' },
  {
    mode: 'reader',
    name: 'Хочу научиться читать',
    hint: 'Транслитерация скрыта, есть кнопка «Подсказка»',
  },
]

/** S07. Настройки (этап 1): режим занятий, сброс прогресса, сведения о приложении. */
export function Settings() {
  const store = useStore()
  const state = useAppState()
  const toast = useToast()
  const [confirmReset, setConfirmReset] = useState(false)
  const mode = state.settings?.mode

  async function changeMode(next: Mode) {
    if (next === mode) return
    toast.show('Режим изменён. Применится со следующей карточки')
    await store.setMode(next)
  }

  async function reset() {
    setConfirmReset(false)
    await store.resetProgress()
    toast.show('Прогресс сброшен')
  }

  return (
    <>
      <header className="appbar">
        <h1>Настройки</h1>
      </header>
      <main className="screen" style={{ gap: 24 }}>
        <section className="stack" aria-labelledby="set-mode">
          <h2 className="t-head" id="set-mode">
            Режим занятий
          </h2>
          <div className="stack" role="radiogroup" aria-labelledby="set-mode">
            {MODES.map((m) => (
              <label key={m.mode} className="radio-card">
                <input
                  type="radio"
                  name="mode"
                  value={m.mode}
                  checked={mode === m.mode}
                  onChange={() => changeMode(m.mode)}
                />
                <span className="stack" style={{ gap: 2 }}>
                  <span className="name">{m.name}</span>
                  <span className="muted t-small">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="stack" aria-labelledby="set-progress">
          <h2 className="t-head" id="set-progress">
            Прогресс
          </h2>
          <div>
            <button
              type="button"
              className="btn btn-danger-text"
              onClick={() => setConfirmReset(true)}
            >
              Сбросить прогресс
            </button>
          </div>
        </section>

        <section className="stack" aria-labelledby="set-about">
          <h2 className="t-head" id="set-about">
            О приложении
          </h2>
          <div className="stack t-small" style={{ gap: 4 }}>
            <div className="kv">
              <span>Версия приложения</span>
              <span>{pkg.version}</span>
            </div>
            <div className="kv">
              <span>Версия словаря</span>
              <span>{store.content.version}</span>
            </div>
            <p className="muted">Транслитерация: схема {store.content.translit_scheme}</p>
          </div>
        </section>
      </main>

      {confirmReset && (
        <ConfirmDialog
          title="Сбросить прогресс?"
          description="Все слова станут новыми, серия обнулится. Режим занятий, ваши наборы и слова сохранятся."
          confirmLabel="Сбросить"
          danger
          onConfirm={reset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </>
  )
}
