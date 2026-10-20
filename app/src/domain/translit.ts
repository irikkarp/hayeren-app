import { normalizeText } from './text'

/**
 * Автоматическая транслитерация по схеме hayeren-latin-v1 (docs/content/README.md):
 * таблица букв и правила 1, 2, 4, 6, 7. Невидимый `ə` (правило 3) не вставляется;
 * написанная буква `ը` всегда даёт `ə` (критерии 52–53).
 */
const LETTERS: Record<string, string> = {
  ա: 'a',
  բ: 'b',
  գ: 'g',
  դ: 'd',
  ե: 'e',
  զ: 'z',
  է: 'e',
  ը: 'ə',
  թ: "t'",
  ժ: 'zh',
  ի: 'i',
  լ: 'l',
  խ: 'kh',
  ծ: 'ts',
  կ: 'k',
  հ: 'h',
  ձ: 'dz',
  ղ: 'gh',
  ճ: 'ch',
  մ: 'm',
  յ: 'y',
  ն: 'n',
  շ: 'sh',
  ո: 'o',
  չ: "ch'",
  պ: 'p',
  ջ: 'j',
  ռ: 'rr',
  ս: 's',
  վ: 'v',
  տ: 't',
  ր: 'r',
  ց: "ts'",
  ւ: 'v',
  փ: "p'",
  ք: "k'",
  և: 'ev',
  օ: 'o',
  ֆ: 'f',
}

/** Что менять в начале слова: ե → ye, ո → vo, և → yev. */
const WORD_START: Record<string, string> = { ե: 'ye', ո: 'vo', և: 'yev' }

/** Знаки ударения/вопроса стоят внутри слова и начало слова не сбрасывают. */
const EMPHASIS = '\u055E\u055C\u055B\u055D\u055A'

const isLetter = (ch: string | undefined) => ch !== undefined && ch in LETTERS

export function transliterate(hy: string): string {
  const s = normalizeText(hy).toLowerCase().replaceAll('եւ', 'և')
  const chars = Array.from(s)
  let out = ''
  let atStart = true
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === 'ո' && chars[i + 1] === 'ւ') {
      out += 'u' // «ու» — одна буква
      i++
      atStart = false
      continue
    }
    if (isLetter(ch)) {
      out += atStart && WORD_START[ch] ? WORD_START[ch] : LETTERS[ch]
      atStart = false
    } else if (ch === ' ') {
      out += ' '
      atStart = true
    } else if (ch === '-') {
      out += '-'
      atStart = true
    } else if (!EMPHASIS.includes(ch)) {
      // Цифры и знаки препинания в транслитерацию не переносятся (правило 6, критерий 49).
      atStart = true
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}
