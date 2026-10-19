/// <reference lib="dom" />
import { expect, type Page } from '@playwright/test'

export const TODAY = '2026-10-19'
/** Полдень «сегодня» по локальному времени: безопасно для проверок дат. */
export const NOW = new Date(2026, 9, 19, 12, 0, 0)

export interface SeedProgress {
  wordId: string
  box: number
  dueDate: string
}
export interface SeedDay {
  date: string
  answered: number
  newStarted?: number
  bonusNew?: number
}
export interface Seed {
  mode?: 'beginner' | 'reader'
  progress?: SeedProgress[]
  days?: SeedDay[]
  celebrations?: { topicId: string; status: 'pending' | 'celebrated' }[]
}

/** Открывает приложение с зафиксированным временем, пишет данные прямо в IndexedDB и перезагружает. */
export async function openWith(page: Page, seed: Seed = {}, time: Date = NOW) {
  await page.clock.install({ time })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Как вы хотите заниматься?' })).toBeVisible()
  await page.evaluate(async (s) => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('hayeren')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const stores = ['settings', 'progress', 'days', 'celebrations']
    const tx = db.transaction(stores, 'readwrite')
    const meta = { updatedAt: 1, deletedAt: null }
    tx.objectStore('settings').put({ id: 'settings', mode: s.mode ?? 'beginner', ...meta })
    for (const p of s.progress ?? []) {
      tx.objectStore('progress').put({
        wordId: p.wordId,
        box: p.box,
        dueDate: p.dueDate,
        lastReviewed: p.dueDate,
        correct: 1,
        wrong: 0,
        ...meta,
      })
    }
    for (const d of s.days ?? []) {
      tx.objectStore('days').put({
        date: d.date,
        answered: d.answered,
        newStarted: d.newStarted ?? 0,
        bonusNew: d.bonusNew ?? 0,
        ...meta,
      })
    }
    for (const c of s.celebrations ?? []) {
      tx.objectStore('celebrations').put({ topicId: c.topicId, status: c.status, ...meta })
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, seed)
  await page.goto('/#/')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Темы' })).toBeVisible()
}

/** Читает хранилище из IndexedDB (живые записи). */
export interface Row {
  wordId?: string
  date?: string
  topicId?: string
  box?: number
  dueDate?: string
  lastReviewed?: string
  correct?: number
  wrong?: number
  status?: string
  answered?: number
  newStarted?: number
  bonusNew?: number
  deletedAt: number | null
}

export async function dump(
  page: Page,
  store: 'progress' | 'days' | 'celebrations',
): Promise<Row[]> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('hayeren')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise<Row[]>((res, rej) => {
      const r = db.transaction(name).objectStore(name).getAll()
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    db.close()
    return rows.filter((r) => r.deletedAt == null)
  }, store)
}

export const ids = (topic: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${topic}-${String(from + i).padStart(2, '0')}`)

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export async function showAnswer(page: Page) {
  await page.getByRole('button', { name: 'Показать ответ' }).click()
}
export async function know(page: Page) {
  await showAnswer(page)
  await page.getByRole('button', { name: 'Знаю', exact: true }).click()
}
export async function dont(page: Page) {
  await showAnswer(page)
  await page.getByRole('button', { name: 'Не знаю', exact: true }).click()
}

export const TOPIC_SIZES: Record<string, number> = {
  greetings: 15,
  numbers: 15,
  shop: 15,
  transport: 14,
  housing: 15,
  food: 14,
}
export const ALL_IDS = Object.entries(TOPIC_SIZES).flatMap(([t, n]) => ids(t, 1, n))

/** Все слова темы в коробке 4 (выучены), срок далеко; исключения задаются отдельно. */
export function learnedTopic(topic: string, except: string[] = []): SeedProgress[] {
  return ids(topic, 1, TOPIC_SIZES[topic])
    .filter((id) => !except.includes(id))
    .map((wordId) => ({ wordId, box: 4, dueDate: addDays(TODAY, 8) }))
}
