import { goBack } from '../router'
import { BackIcon } from './Icons'

/** Верхняя панель экрана без вкладок: «‹» и заголовок. */
export function TopBar({ title }: { title: string }) {
  return (
    <header className="appbar">
      <button type="button" className="icon-btn" aria-label="Назад" onClick={goBack}>
        <BackIcon />
      </button>
      <h1>{title}</h1>
    </header>
  )
}
