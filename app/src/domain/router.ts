import type { SessionTarget } from './queue'

/** Маршруты приложения (hash-роутинг: `#/путь`). Этапы 2 и 3 добавят `/sets/:id`, `/add*`. */
export type Route =
  | { name: 'welcome' }
  | { name: 'home' }
  | { name: 'session'; target: SessionTarget }
  | { name: 'result' }
  | { name: 'alphabet' }
  | { name: 'settings' }
  | { name: 'notfound' }

export function parsePath(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const path = raw.split('?')[0]
  if (!path) return '/'
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

export function matchRoute(path: string): Route {
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent)
  if (seg.length === 0) return { name: 'home' }
  const [a, b, c] = seg
  if (seg.length === 1) {
    if (a === 'welcome') return { name: 'welcome' }
    if (a === 'alphabet') return { name: 'alphabet' }
    if (a === 'settings') return { name: 'settings' }
  }
  if (a === 'session') {
    if (seg.length === 2 && b === 'review') return { name: 'session', target: { type: 'review' } }
    if (seg.length === 2 && b === 'result') return { name: 'result' }
    if (seg.length === 3 && b === 'topic') {
      return { name: 'session', target: { type: 'topic', topicId: c } }
    }
    if (seg.length === 3 && b === 'set') {
      return { name: 'session', target: { type: 'set', setId: c } }
    }
  }
  return { name: 'notfound' }
}

export function targetPath(target: SessionTarget): string {
  if (target.type === 'review') return '/session/review'
  if (target.type === 'topic') return `/session/topic/${encodeURIComponent(target.topicId)}`
  return `/session/set/${encodeURIComponent(target.setId)}`
}
