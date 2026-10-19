import { describe, expect, it } from 'vitest'
import { matchRoute, parsePath, targetPath } from './router'

describe('роутинг', () => {
  it('parsePath', () => {
    expect(parsePath('')).toBe('/')
    expect(parsePath('#')).toBe('/')
    expect(parsePath('#/')).toBe('/')
    expect(parsePath('#/alphabet/')).toBe('/alphabet')
    expect(parsePath('#/settings?x=1')).toBe('/settings')
  })

  it('маршруты', () => {
    expect(matchRoute('/')).toEqual({ name: 'home' })
    expect(matchRoute('/welcome')).toEqual({ name: 'welcome' })
    expect(matchRoute('/alphabet')).toEqual({ name: 'alphabet' })
    expect(matchRoute('/settings')).toEqual({ name: 'settings' })
    expect(matchRoute('/session/review')).toEqual({ name: 'session', target: { type: 'review' } })
    expect(matchRoute('/session/topic/food')).toEqual({
      name: 'session',
      target: { type: 'topic', topicId: 'food' },
    })
    expect(matchRoute('/session/set/abc')).toEqual({
      name: 'session',
      target: { type: 'set', setId: 'abc' },
    })
    expect(matchRoute('/session/result')).toEqual({ name: 'result' })
    expect(matchRoute('/nope')).toEqual({ name: 'notfound' })
    expect(matchRoute('/session/topic')).toEqual({ name: 'notfound' })
  })

  it('targetPath обратен matchRoute', () => {
    for (const target of [
      { type: 'review' },
      { type: 'topic', topicId: 'shop' },
      { type: 'set', setId: 'x y' },
    ] as const) {
      expect(matchRoute(targetPath(target))).toEqual({ name: 'session', target })
    }
  })
})
