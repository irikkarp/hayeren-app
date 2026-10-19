import { useMemo, useSyncExternalStore } from 'react'
import { matchRoute, parsePath, type Route } from './domain/router'

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const getHash = () => window.location.hash

/** Текущий маршрут (hash-роутинг: работает на любом статическом хостинге и офлайн). */
export function useRoute(): { route: Route; path: string } {
  const hash = useSyncExternalStore(subscribe, getHash)
  return useMemo(() => {
    const path = parsePath(hash)
    return { path, route: matchRoute(path) }
  }, [hash])
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  const hash = `#${path}`
  if (options.replace) {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else if (window.location.hash !== hash) {
    window.location.hash = hash
  }
}

/** Кнопка «‹»: на шаг назад, а если истории нет (страница открыта по ссылке), на главную. */
export function goBack(): void {
  if (window.history.length > 1) window.history.back()
  else navigate('/', { replace: true })
}
