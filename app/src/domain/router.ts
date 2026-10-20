import type { SessionTarget } from './queue'

/** Маршруты приложения (hash-роутинг: `#/путь`). */
export type Route =
  | { name: 'welcome' }
  | { name: 'home' }
  | { name: 'session'; target: SessionTarget }
  | { name: 'result' }
  | { name: 'alphabet' }
  | { name: 'settings' }
  | { name: 'set'; setId: string }
  | { name: 'wordEdit'; setId: string; wordId: string }
  | { name: 'add' }
  | { name: 'addPaste' }
  | { name: 'addWord' }
  | { name: 'addFile' }
  | { name: 'addColumns' }
  | { name: 'addPreview' }
  | { name: 'notfound' }

export function parsePath(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const path = raw.split('?')[0]
  if (!path) return '/'
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/** Параметр `?set=<id>`: набор, из которого открыто добавление слов. */
export function parseSetParam(hash: string): string | null {
  const query = hash.split('?')[1] ?? ''
  return new URLSearchParams(query).get('set') || null
}

/** Путь добавления слов с необязательным `?set=`. */
export function addPath(
  sub: '' | 'paste' | 'word' | 'file' | 'file/columns' | 'preview',
  setId: string | null,
): string {
  const base = sub ? `/add/${sub}` : '/add'
  return setId ? `${base}?set=${encodeURIComponent(setId)}` : base
}

export function matchRoute(path: string): Route {
  let seg: string[]
  try {
    seg = path.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return { name: 'notfound' } // испорченный процент-код в адресе
  }
  if (seg.length === 0) return { name: 'home' }
  const [a, b, c] = seg
  if (seg.length === 1) {
    if (a === 'welcome') return { name: 'welcome' }
    if (a === 'alphabet') return { name: 'alphabet' }
    if (a === 'settings') return { name: 'settings' }
  }
  if (a === 'sets' && b) {
    if (seg.length === 2) return { name: 'set', setId: b }
    if (seg.length === 4 && c === 'words') return { name: 'wordEdit', setId: b, wordId: seg[3] }
  }
  if (a === 'add') {
    if (seg.length === 1) return { name: 'add' }
    if (seg.length === 2 && b === 'paste') return { name: 'addPaste' }
    if (seg.length === 2 && b === 'word') return { name: 'addWord' }
    if (seg.length === 2 && b === 'file') return { name: 'addFile' }
    if (seg.length === 2 && b === 'preview') return { name: 'addPreview' }
    if (seg.length === 3 && b === 'file' && c === 'columns') return { name: 'addColumns' }
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
