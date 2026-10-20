import { useId } from 'react'
import { addPath } from '../domain/router'
import { countPasteLines, MAX_PASTE_LINES, parsePaste, pasteTooLongMessage } from '../domain/paste'
import { navigate, useRoute } from '../router'
import { useAppState, useStore } from '../store/context'
import { TopBar } from '../ui/TopBar'

/** S10. Вставить список (критерии 58–61, 64). */
export function Paste() {
  const store = useStore()
  const { addFlow } = useAppState()
  const { setParam } = useRoute()
  const fieldId = useId()
  const hintId = useId()
  const errId = useId()
  const text = addFlow.pasteText
  const lines = countPasteLines(text)
  const tooLong = lines > MAX_PASTE_LINES
  const empty = lines === 0

  function parse() {
    if (empty || tooLong) return
    store.setAddFlow({
      preview: { source: 'paste', fileName: null, parsed: parsePaste(text) },
      file: null,
      mapping: null,
    })
    navigate(addPath('preview', setParam))
  }

  return (
    <>
      <TopBar title="Вставить список" />
      <main className="screen">
        <div className={`field${tooLong ? ' is-error' : ''}`}>
          <label htmlFor={fieldId}>Слова по одному на строке</label>
          <textarea
            id={fieldId}
            className="textarea hy"
            lang="hy"
            value={text}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={tooLong ? true : undefined}
            aria-describedby={tooLong ? `${hintId} ${errId}` : hintId}
            placeholder={'բարև — привет\nհաց — хлеб'}
            onChange={(e) => store.setAddFlow({ pasteText: e.target.value })}
          />
          <p id={hintId} className="hint">
            Формат: «բարև — привет». Разделитель: тире, табуляция или точка с запятой. Третья часть
            — транслитерация. Не больше {MAX_PASTE_LINES} строк.
          </p>
          {tooLong && (
            <p className="error-text" id={errId} role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{pasteTooLongMessage(lines)}</span>
            </p>
          )}
        </div>
        <p className="hint">
          Нет армянской раскладки? Включите её в настройках клавиатуры телефона.
        </p>
      </main>
      <div className="stickybar">
        {empty && (
          <p className="hint" id="paste-empty">
            Вставьте список, чтобы продолжить
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={empty || tooLong}
          aria-describedby={empty ? 'paste-empty' : undefined}
          onClick={parse}
        >
          Разобрать
        </button>
      </div>
    </>
  )
}
