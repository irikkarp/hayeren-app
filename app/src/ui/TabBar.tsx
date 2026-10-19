import type { Route } from '../domain/router'
import { GearIcon, HomeIcon } from './Icons'

const TABS = [
  { href: '#/', name: 'home', label: 'Главная' },
  { href: '#/alphabet', name: 'alphabet', label: 'Алфавит' },
  { href: '#/settings', name: 'settings', label: 'Настройки' },
] as const

/** Нижняя навигация (ui-kit, раздел 5). Показывается только на корневых экранах. */
export function TabBar({ route }: { route: Route }) {
  return (
    <nav className="tabbar" aria-label="Разделы">
      {TABS.map((tab) => (
        <a
          key={tab.name}
          href={tab.href}
          className="tab"
          aria-current={route.name === tab.name ? 'page' : undefined}
        >
          {tab.name === 'home' && <HomeIcon />}
          {tab.name === 'alphabet' && (
            <span className="hy-l" lang="hy" aria-hidden="true">
              Ա
            </span>
          )}
          {tab.name === 'settings' && <GearIcon />}
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  )
}
