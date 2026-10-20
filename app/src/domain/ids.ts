/** Новый UUID v4. `crypto.randomUUID` есть только в защищённом контексте, поэтому запасной путь. */
export function newUuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Префикс id своих слов: не пересекается с id встроенных (`greetings-01`). */
export const USER_WORD_PREFIX = 'u-'
export const newUserWordId = (): string => `${USER_WORD_PREFIX}${newUuid()}`
