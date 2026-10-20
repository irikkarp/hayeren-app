import { describe, expect, it } from 'vitest'
import { addPath, matchRoute, parsePath, parseSetParam, targetPath } from './router'

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

describe('маршруты этапа 2', () => {
  it('набор, слово, шаги добавления', () => {
    expect(matchRoute('/sets/abc')).toEqual({ name: 'set', setId: 'abc' })
    expect(matchRoute('/sets/abc/words/u-1')).toEqual({
      name: 'wordEdit',
      setId: 'abc',
      wordId: 'u-1',
    })
    expect(matchRoute('/add')).toEqual({ name: 'add' })
    expect(matchRoute('/add/paste')).toEqual({ name: 'addPaste' })
    expect(matchRoute('/add/word')).toEqual({ name: 'addWord' })
    expect(matchRoute('/add/file')).toEqual({ name: 'addFile' })
    expect(matchRoute('/add/file/columns')).toEqual({ name: 'addColumns' })
    expect(matchRoute('/add/preview')).toEqual({ name: 'addPreview' })
    expect(matchRoute('/add/nope')).toEqual({ name: 'notfound' })
    expect(matchRoute('/sets')).toEqual({ name: 'notfound' })
    expect(matchRoute('/sets/a/b')).toEqual({ name: 'notfound' })
  })

  it('?set= передаётся по всему потоку добавления', () => {
    expect(parseSetParam('#/add/paste?set=abc')).toBe('abc')
    expect(parseSetParam('#/add/paste')).toBeNull()
    expect(parseSetParam('#/add?set=')).toBeNull()
    expect(addPath('', null)).toBe('/add')
    expect(addPath('file/columns', 'a b')).toBe('/add/file/columns?set=a%20b')
    expect(parseSetParam(`#${addPath('word', 'a b')}`)).toBe('a b')
    expect(parsePath('#/add/word?set=x')).toBe('/add/word')
  })
})
