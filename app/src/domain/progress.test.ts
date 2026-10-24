import { afterEach, describe, expect, it } from 'vitest'
import { prog, progressMap } from '../test/fixtures'
import { addDays, toDateKey } from './dates'
import {
  buildExplain,
  formatReviewDate,
  newWordsWord,
  nextReviewDate,
  nextReviewText,
  noDueText,
  progressCounts,
  progressLine,
  progressValueText,
  remainingNewText,
  segmentWidths,
  SCHEME_ALL_DONT_TEXT,
  SCHEME_TEXT,
  type ExplainInput,
} from './progress'
import { LEARNED_BOX } from './srs'

const TODAY = '2026-10-24'
const words = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `w-${i + 1}` }))
const withBoxes = (boxes: number[]) =>
  progressMap(...boxes.map((box, i) => prog(`w-${i + 1}`, box, TODAY)))

describe('progressCounts (критерии 149, 166а)', () => {
  it('ничего не начато: (0, 0, N)', () => {
    expect(progressCounts(words(15), {})).toEqual({
      learned: 0,
      learning: 0,
      notStarted: 15,
      total: 15,
    })
  })

  it('10 слов в коробке 2 из 15: (0, 10, 5)', () => {
    const p = withBoxes(Array(10).fill(2))
    expect(progressCounts(words(15), p)).toEqual({
      learned: 0,
      learning: 10,
      notStarted: 5,
      total: 15,
    })
  })

  it('коробки 1, 3, 4, 5: выучены только 4 и 5', () => {
    const c = progressCounts(words(4), withBoxes([1, 3, 4, 5]))
    expect(c).toMatchObject({ learned: 2, learning: 2, notStarted: 0 })
  })

  it('откат 4 → 1 переводит слово из «выучено» в «в изучении»', () => {
    expect(progressCounts(words(1), withBoxes([4]))).toMatchObject({ learned: 1, learning: 0 })
    expect(progressCounts(words(1), withBoxes([1]))).toMatchObject({ learned: 0, learning: 1 })
  })

  it('регрессия порога: выучено = box ≥ 4', () => {
    expect(LEARNED_BOX).toBe(4)
    expect(progressCounts(words(1), withBoxes([3])).learned).toBe(0)
    expect(progressCounts(words(1), withBoxes([4])).learned).toBe(1)
  })

  it('состояния чужих id игнорируются (критерий 163ж)', () => {
    const p = progressMap(prog('gone-1', 5, TODAY), prog('w-1', 2, TODAY))
    expect(progressCounts(words(2), p)).toEqual({
      learned: 0,
      learning: 1,
      notStarted: 1,
      total: 2,
    })
  })

  it('X + Y + Z = N на случайных данных', () => {
    let seed = 12345
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    for (let round = 0; round < 50; round++) {
      const n = Math.floor(rnd() * 40)
      const boxes: number[] = []
      for (let i = 0; i < n; i++) if (rnd() < 0.7) boxes.push(1 + Math.floor(rnd() * 5))
      const c = progressCounts(words(n), withBoxes(boxes))
      expect(c.learned + c.learning + c.notStarted).toBe(c.total)
      expect(c.total).toBe(n)
    }
  })
})

describe('строка прогресса и бар (критерии 150–152, 166б, в)', () => {
  const counts = (learned: number, learning: number, total: number) => ({
    learned,
    learning,
    notStarted: total - learned - learning,
    total,
  })

  it('форматы строки', () => {
    expect(progressLine(counts(0, 10, 15))).toBe('выучено 0 · в изучении 10 из 15')
    expect(progressLine(counts(3, 7, 15))).toBe('выучено 3 · в изучении 7 из 15')
    expect(progressLine(counts(0, 0, 15))).toBe('выучено 0 из 15')
    expect(progressLine(counts(15, 0, 15))).toBe('выучено 15 из 15')
    expect(progressLine(counts(1200, 1500, 3000))).toBe('выучено 1200 · в изучении 1500 из 3000')
    expect(progressLine(counts(0, 0, 0))).toBe('0 слов')
  })

  it('aria-valuetext', () => {
    expect(progressValueText(counts(6, 5, 15))).toBe('выучено 6, в изучении 5 из 15')
    expect(progressValueText(counts(0, 0, 15))).toBe('выучено 0 из 15')
  })

  it('ширины сегментов X/N и Y/N, сумма не больше 100 %', () => {
    const w = segmentWidths(counts(6, 5, 15))
    expect(w.learned).toBeCloseTo(40)
    expect(w.learning).toBeCloseTo(33.333, 2)
    expect(w.learned + w.learning).toBeLessThanOrEqual(100)
    expect(segmentWidths(counts(15, 0, 15))).toEqual({ learned: 100, learning: 0 })
    expect(segmentWidths(counts(0, 0, 0))).toEqual({ learned: 0, learning: 0 })
  })

  it('ненулевой сегмент не нулевой ширины даже при N = 3000', () => {
    const w = segmentWidths(counts(1, 1, 3000))
    expect(w.learned).toBeGreaterThan(0)
    expect(w.learning).toBeGreaterThan(0)
  })
})

describe('nextReviewDate (критерий 157, 166г)', () => {
  it('минимальный dueDate по всем словам', () => {
    const p = progressMap(
      prog('w-1', 2, '2026-11-02'),
      prog('w-2', 3, '2026-10-26'),
      prog('w-3', 5, '2027-01-01'),
    )
    expect(nextReviewDate(words(3), p)).toBe('2026-10-26')
  })

  it('нет состояний — нет даты', () => {
    expect(nextReviewDate(words(3), {})).toBeNull()
  })

  it('состояния слов вне каталога не учитываются', () => {
    expect(nextReviewDate(words(1), progressMap(prog('gone-1', 2, '2026-10-25')))).toBeNull()
  })
})

describe('formatReviewDate (критерий 158, 166д)', () => {
  it('сегодня 2026-10-24', () => {
    expect(formatReviewDate('2026-10-24', TODAY)).toBe('сегодня')
    expect(formatReviewDate('2026-10-25', TODAY)).toBe('завтра')
    expect(formatReviewDate('2026-10-26', TODAY)).toBe('послезавтра')
    expect(formatReviewDate('2026-10-27', TODAY)).toBe('27 октября')
    expect(formatReviewDate('2026-11-05', TODAY)).toBe('5 ноября')
  })

  it('дата в прошлом — «сегодня»', () => {
    expect(formatReviewDate('2026-10-01', TODAY)).toBe('сегодня')
  })

  it('граница года', () => {
    const t = '2026-12-30'
    expect(formatReviewDate('2026-12-31', t)).toBe('завтра')
    expect(formatReviewDate('2027-01-01', t)).toBe('послезавтра')
    expect(formatReviewDate('2027-01-05', t)).toBe('5 января 2027')
  })

  it('29 февраля високосного года', () => {
    expect(formatReviewDate('2028-02-29', '2028-02-26')).toBe('29 февраля')
  })

  it('все месяцы в родительном падеже', () => {
    const names = [
      'января',
      'февраля',
      'марта',
      'апреля',
      'мая',
      'июня',
      'июля',
      'августа',
      'сентября',
      'октября',
      'ноября',
      'декабря',
    ]
    names.forEach((m, i) => {
      const mm = String(i + 1).padStart(2, '0')
      expect(formatReviewDate(`2026-${mm}-15`, '2026-01-01')).toBe(`15 ${m}`)
    })
  })

  describe('переход на летнее и зимнее время', () => {
    const prev = process.env.TZ
    afterEach(() => {
      if (prev === undefined) delete process.env.TZ
      else process.env.TZ = prev
    })

    it.each([
      ['America/New_York', '2026-03-07', '2026-03-08'], // весна: сутки 23 часа
      ['America/New_York', '2026-10-31', '2026-11-01'], // осень: сутки 25 часов
      ['Europe/Berlin', '2026-03-28', '2026-03-29'],
      ['Europe/Berlin', '2026-10-24', '2026-10-25'],
    ])('%s: %s → %s даёт «завтра»', (tz, today, tomorrow) => {
      process.env.TZ = tz
      expect(formatReviewDate(tomorrow, today)).toBe('завтра')
      expect(formatReviewDate(addDays(today, 2), today)).toBe('послезавтра')
      // «сегодня» из локальных часов устройства в полночь по переходу тоже даёт корректный ключ
      expect(
        toDateKey(new Date(2026, Number(today.slice(5, 7)) - 1, Number(today.slice(8)), 23, 30)),
      ).toBe(today)
    })
  })
})

describe('тексты при N = 0 (критерии 113, 159, 166з)', () => {
  it('нет состояний — подсказка', () => {
    expect(noDueText(null, TODAY)).toBe('Пока нечего повторять: начните с любой темы')
  })
  it('есть состояния — дата без точки', () => {
    expect(noDueText('2026-10-25', TODAY)).toBe('Следующее повторение — завтра')
    expect(noDueText('2026-10-26', TODAY)).toBe('Следующее повторение — послезавтра')
    expect(noDueText('2026-10-28', TODAY)).toBe('Следующее повторение — 28 октября')
    expect(noDueText('2027-01-05', TODAY)).toBe('Следующее повторение — 5 января 2027')
  })
  it('с точкой для итога сессии', () => {
    expect(nextReviewText('2026-10-26', TODAY, true)).toBe('Следующее повторение — послезавтра.')
  })
})

describe('«осталось K новых слов» (критерий 155, 166е)', () => {
  it.each([
    [1, 'новое слово'],
    [2, 'новых слова'],
    [4, 'новых слова'],
    [5, 'новых слов'],
    [11, 'новых слов'],
    [12, 'новых слов'],
    [14, 'новых слов'],
    [21, 'новое слово'],
    [22, 'новых слова'],
    [25, 'новых слов'],
    [101, 'новое слово'],
    [111, 'новых слов'],
  ])('K = %i → %s', (k, form) => {
    expect(newWordsWord(k)).toBe(form)
    expect(remainingNewText(k, 'topic', 'Жильё')).toBe(`В теме «Жильё» осталось ${k} ${form}.`)
  })

  it('набор и K = 0', () => {
    expect(remainingNewText(3, 'set', 'Урок 5')).toBe('В наборе «Урок 5» осталось 3 новых слова.')
    expect(remainingNewText(0, 'topic', 'Жильё')).toBeNull()
  })
})

describe('сборка текста итога (критерии 154–156, 160, 166ж)', () => {
  const base: ExplainInput = {
    isReview: false,
    newCount: 10,
    newKnow: 10,
    dueLeft: 0,
    nextDate: '2026-10-26',
    today: TODAY,
    remainingNew: 5,
    targetKind: 'topic',
    targetTitle: 'Приветствия и вежливость',
  }

  it('10 «Знаю» и K = 5 (пример из критерия 154)', () => {
    expect(buildExplain(base)).toEqual({
      lead: { title: 'Новых слов в изучении: 10.', detail: SCHEME_TEXT },
      next: [
        'Следующее повторение — послезавтра.',
        'В теме «Приветствия и вежливость» осталось 5 новых слов.',
      ],
    })
    expect(SCHEME_TEXT).toBe(
      'Слово становится выученным после двух повторений: через 2 дня и ещё через 4.',
    )
  })

  it('10 «Не знаю»: схема не обещается, повторение завтра', () => {
    const e = buildExplain({ ...base, newKnow: 0, nextDate: '2026-10-25' })
    expect(e.lead).toEqual({
      title: 'Новых слов в изучении: 10.',
      detail: SCHEME_ALL_DONT_TEXT,
    })
    expect(e.next[0]).toBe('Следующее повторение — завтра.')
  })

  it('смесь: хотя бы одно «Знаю» — фраза о схеме', () => {
    expect(buildExplain({ ...base, newKnow: 7 }).lead?.detail).toBe(SCHEME_TEXT)
  })

  it('m = 0 в сессии по теме: только строка про новые слова, если K > 0', () => {
    const e = buildExplain({ ...base, newCount: 0, newKnow: 0 })
    expect(e.lead).toBeNull()
    expect(e.next).toEqual([
      'Следующее повторение — послезавтра.',
      'В теме «Приветствия и вежливость» осталось 5 новых слов.',
    ])
  })

  it('N > 0 после сессии: даты нет', () => {
    const e = buildExplain({ ...base, dueLeft: 4 })
    expect(e.next).toEqual(['В теме «Приветствия и вежливость» осталось 5 новых слов.'])
  })

  it('K = 0 и N > 0, m = 0: блок пуст', () => {
    expect(buildExplain({ ...base, newCount: 0, newKnow: 0, dueLeft: 3, remainingNew: 0 })).toEqual(
      {
        lead: null,
        next: [],
      },
    )
  })

  it('нет состояний вообще: даты нет', () => {
    const e = buildExplain({ ...base, newCount: 0, newKnow: 0, nextDate: null, remainingNew: 0 })
    expect(e).toEqual({ lead: null, next: [] })
  })

  it('общая сессия с N = 0: только дата', () => {
    const e = buildExplain({
      ...base,
      isReview: true,
      newCount: 0,
      newKnow: 0,
      remainingNew: 0,
      nextDate: '2027-01-05',
    })
    expect(e).toEqual({ lead: null, next: ['Следующее повторение — 5 января 2027.'] })
  })

  it('общая сессия с N > 0: блока нет', () => {
    const e = buildExplain({ ...base, isReview: true, newCount: 0, newKnow: 0, dueLeft: 6 })
    expect(e).toEqual({ lead: null, next: [] })
  })

  it('набор вместо темы', () => {
    const e = buildExplain({ ...base, targetKind: 'set', targetTitle: 'Урок 5', remainingNew: 1 })
    expect(e.next[1]).toBe('В наборе «Урок 5» осталось 1 новое слово.')
  })
})
