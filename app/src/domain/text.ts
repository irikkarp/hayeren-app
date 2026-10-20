const ARMENIAN_PUNCTUATION = /[՞՜՛]/g

/** Невидимые символы: нулевой ширины, направления письма, мягкий перенос, BOM, word joiner. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\u00AD\uFEFF]/g

/**
 * Unicode NFC, удаление невидимых символов (копирование из мессенджеров), обрезка пробелов по
 * краям, схлопывание повторных пробелов. Регистр не меняется.
 */
export function normalizeText(s: string): string {
  return s.normalize('NFC').replace(INVISIBLE, '').trim().replace(/\s+/g, ' ')
}

/**
 * Нормализованный ключ для сравнения слов (поиск дубликатов, сравнение ответов): NFC, пробелы,
 * нижний регистр, `եւ` → `և`, без армянских знаков `՞ ՜ ՛`.
 */
export function normalizeKey(s: string): string {
  return normalizeText(s)
    .toLowerCase()
    .replaceAll('եւ', 'և')
    .replaceAll('եվ', 'և') // ԵՎ — заглавная форма և
    .replace(ARMENIAN_PUNCTUATION, '')
}

/** Длина самого длинного слова (в символах Unicode после NFC): по ней выбирается кегль слова на карточке. */
export function longestWordLength(hy: string): number {
  return normalizeText(hy)
    .split(' ')
    .reduce((max, word) => Math.max(max, Array.from(word).length), 0)
}

/** Класс размера для `hy-hero` (ui-kit 3.3): до 9 символов — 44px, 10–12 — 36px, 13 и больше — 28px. */
export function heroSizeClass(hy: string): '' | 'is-long' | 'is-xlong' {
  const len = longestWordLength(hy)
  if (len <= 9) return ''
  if (len <= 12) return 'is-long'
  return 'is-xlong'
}
