import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  description?: string
  confirmLabel: string
  /** Разрушающее действие: кнопка подтверждения красная (`danger`). */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Диалог подтверждения (ui-kit 6.10): role="alertdialog", фокус сначала на «Отмена»,
 * Tab зациклен, Esc и нажатие на затемнение = «Отмена», фон недоступен, фокус возвращается.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId()
  const descId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const cancelHandler = useRef(onCancel)

  useEffect(() => {
    cancelHandler.current = onCancel
  })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    cancelRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelHandler.current()
      } else if (e.key === 'Tab') {
        const buttons = sheetRef.current?.querySelectorAll<HTMLButtonElement>('button')
        if (!buttons || buttons.length === 0) return
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      root?.removeAttribute('inert')
      opener?.focus()
    }
  }, [])

  return createPortal(
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="sheet"
        ref={sheetRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <h2 className="t-heading" id={titleId}>
          {title}
        </h2>
        {description && (
          <p className="t-body" id={descId}>
            {description}
          </p>
        )}
        <button
          type="button"
          className={`btn btn-block ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          ref={cancelRef}
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
    </div>,
    document.body,
  )
}
