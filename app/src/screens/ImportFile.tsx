import { useRef, useState } from 'react'
import { readImportFile } from '../data/readImportFile'
import { detectMapping } from '../domain/importFile'
import { addPath } from '../domain/router'
import { navigate, useRoute } from '../router'
import { useAppState, useStore } from '../store/context'
import { StorageNote } from '../ui/StorageNote'
import { TopBar } from '../ui/TopBar'

/** S13. Импорт: выбор файла (критерии 71–73, 79, 84). */
export function ImportFile() {
  const store = useStore()
  const { addFlow } = useAppState()
  const { setParam } = useRoute()
  const inputRef = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function load(file: File | undefined) {
    if (!file || reading) return
    setError(null)
    setReading(true)
    const res = await readImportFile(file)
    setReading(false)
    if (inputRef.current) inputRef.current.value = ''
    if (!res.ok) {
      setError(res.error)
      // Неудачная загрузка: прежний файл больше не предлагается.
      store.setAddFlow({ file: null, mapping: null, preview: null })
      return
    }
    store.setAddFlow({ file: res.file, mapping: detectMapping(res.file.rows), preview: null })
    navigate(addPath('file/columns', setParam))
  }

  return (
    <>
      <TopBar title="Импорт из файла" />
      <main className="screen">
        {error && (
          <div className="banner banner-err" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <div
          className={`dropzone${dragging ? ' is-drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void load(e.dataTransfer.files[0])
          }}
        >
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-label="Файл для импорта"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => void load(e.target.files?.[0])}
          />
          {reading ? (
            <p role="status" className="btn btn-block btn-secondary" aria-live="polite">
              Читаем файл…
            </p>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => inputRef.current?.click()}
            >
              Выбрать файл
            </button>
          )}
          <p className="hint dropzone-or">или перетащите файл сюда</p>
          <p className="hint">Подходят файлы .csv и .xlsx, до 5 МБ и 3000 строк</p>
        </div>

        {addFlow.file && !reading && (
          <div className="stack">
            <p className="hint">Выбран файл «{addFlow.file.name}».</p>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => navigate(addPath('file/columns', setParam))}
            >
              Продолжить с этим файлом
            </button>
          </div>
        )}

        <section className="stack" aria-labelledby="how-to">
          <h2 className="t-heading" id="how-to">
            Как подготовить файл
          </h2>
          <div
            className="map-scroll"
            tabIndex={0}
            role="region"
            aria-label="Пример таблицы для импорта"
          >
            <table className="map-table">
              <thead>
                <tr>
                  <th scope="col">Армянское слово</th>
                  <th scope="col">Перевод</th>
                  <th scope="col">Транслитерация</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="hy hy-small" lang="hy">
                    բարև
                  </td>
                  <td>привет</td>
                  <td>barev</td>
                </tr>
                <tr>
                  <td className="hy hy-small" lang="hy">
                    շնորհակալություն
                  </td>
                  <td>спасибо</td>
                  <td>(пусто)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="hint">Транслитерацию можно не заполнять, мы создадим её сами</p>
          <p className="hint">Файл, который вы выгрузили из Hayeren, загружается без настройки.</p>
        </section>

        <StorageNote />
      </main>
    </>
  )
}
