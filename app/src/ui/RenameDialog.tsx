import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SET_TITLE_MESSAGES, type SetTitleError } from '../domain/wordValidation'
import { useModal } from './useModal'

interface Props {
  title: string
  /** Возвращает ошибку названия или null, если сохранено/закрыто. */
  onSave: (title: string) => Promise<SetTitleError | null>
  onCancel: () => void
}

/** D5. Диалог «Переименовать набор»: поле с ошибками под ним, «Сохранить» и «Отмена». */
export function RenameDialog({ title, onSave, onCancel }: Props) {
  const headingId = useId()
  const inputId = useId()
  const errId = useId()
  const sheetRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(title)
  const [error, setError] = useState<SetTitleError | null>(null)
  const [busy, setBusy] = useState(false)
  useModal(sheetRef, inputRef, onCancel)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const result = await onSave(value)
    setBusy(false)
    if (result) {
      setError(result)
      inputRef.current?.focus()
    }
  }

  return createPortal(
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        className="sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onSubmit={submit}
        noValidate
      >
        <h2 className="t-heading" id={headingId}>
          Переименовать набор
        </h2>
        <div className={`field${error ? ' is-error' : ''}`}>
          <label htmlFor={inputId}>Название</label>
          <input
            id={inputId}
            ref={inputRef}
            className="input"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            onChange={(e) => setValue(e.target.value)}
          />
          {error && (
            <p className="error-text" id={errId}>
              <span aria-hidden="true">⚠</span>
              <span>{SET_TITLE_MESSAGES[error]}</span>
            </p>
          )}
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          Сохранить
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={onCancel}>
          Отмена
        </button>
      </form>
    </div>,
    document.body,
  )
}
