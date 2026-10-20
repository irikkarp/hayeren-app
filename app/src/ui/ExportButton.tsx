import { useId } from 'react'
import { useExport } from './useExport'

interface Props {
  label: string
  /** Состояние экспорта из `useExport` (результат показывает вызывающий экран через `ExportStatus`). */
  exporter: ReturnType<typeof useExport>
  hasWords: boolean
  /** Видимое пояснение, почему кнопка недоступна (критерий 89). */
  emptyText: string
  className: string
}

/** Кнопка экспорта (критерий 88): «Готовим файл…» во время работы, пояснение при отсутствии слов. */
export function ExportButton({ label, exporter, hasWords, emptyText, className }: Props) {
  const { run, busy } = exporter
  const emptyId = useId()
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!hasWords || busy}
        aria-describedby={hasWords ? undefined : emptyId}
        onClick={run}
      >
        {busy ? 'Готовим файл…' : label}
      </button>
      {!hasWords && (
        <p className="hint" id={emptyId}>
          {emptyText}
        </p>
      )}
    </>
  )
}
