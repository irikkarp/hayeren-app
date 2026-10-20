import { EXPORT_DONE, EXPORT_FAILED } from '../domain/exportCsv'
import type { ExportStatus as Status } from './useExport'

/** Результат экспорта прямо под кнопкой (критерий 99): не перекрывает экран, как тост. */
export function ExportStatus({ status, onClose }: { status: Status; onClose: () => void }) {
  if (status === 'failed') {
    return (
      <p className="error-text" role="alert">
        {EXPORT_FAILED}
      </p>
    )
  }
  if (status === 'done') {
    return (
      <div className="toast export-status" role="status">
        <span>{EXPORT_DONE}</span>
        <button type="button" onClick={onClose}>
          Закрыть
        </button>
      </div>
    )
  }
  return null
}
