import { goBack } from '../router'
import { BackIcon } from './Icons'

/** Верхняя панель экрана без вкладок: «‹» и заголовок. `onBack` заменяет обычный возврат. */
export function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="appbar">
      <button type="button" className="icon-btn" aria-label="Назад" onClick={onBack ?? goBack}>
        <BackIcon />
      </button>
      <h1>{title}</h1>
    </header>
  )
}
