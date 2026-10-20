import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from './useModal'

interface Props {
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
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
  cancelLabel = 'Отмена',
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId()
  const descId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  useModal(sheetRef, cancelRef, onCancel)

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
          {cancelLabel}
        </button>
      </div>
    </div>,
    document.body,
  )
}
