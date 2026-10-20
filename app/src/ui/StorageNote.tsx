import { FEATURES } from '../features'

/** Постоянная заметка о хранении своих слов (критерии 85, 98). */
export function StorageNote() {
  return (
    <div className="banner banner-info">
      <span>
        Свои слова хранятся только в этом браузере на этом устройстве. Если очистить данные браузера
        или удалить приложение, они пропадут.
        {FEATURES.backup && ' Сохраните резервную копию.'}
      </span>
    </div>
  )
}
