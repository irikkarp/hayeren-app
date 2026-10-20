import { NOTHING_TO_EXPORT } from '../domain/exportCsv'
import { FEATURES } from '../features'
import { useAppState } from '../store/context'
import { ExportStatus } from './ExportStatus'
import { useExport } from './useExport'

const NOTE =
  'Свои слова хранятся только в этом браузере на этом устройстве. Если очистить данные браузера или удалить приложение, они пропадут.'

/** Постоянная заметка о хранении своих слов; с этапом 3 — с напоминанием о копии (критерии 85, 98). */
export function StorageNote() {
  const { userWords } = useAppState()
  const { run, busy, status, close } = useExport()
  if (!FEATURES.backup) {
    return (
      <div className="banner banner-info">
        <span>{NOTE}</span>
      </div>
    )
  }
  const empty = userWords.length === 0
  return (
    <>
      <ExportStatus status={status} onClose={close} />
      <div className="banner banner-info">
        <div className="stack" style={{ gap: 4, alignItems: 'flex-start' }}>
          <span>{NOTE} Сохраните резервную копию.</span>
          <button
            type="button"
            className="btn btn-text"
            disabled={empty || busy}
            onClick={run}
            style={{ paddingLeft: 0 }}
          >
            Экспортировать
          </button>
          {empty && <span className="t-small">{NOTHING_TO_EXPORT}</span>}
        </div>
      </div>
    </>
  )
}
