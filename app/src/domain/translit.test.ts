import { describe, expect, it } from 'vitest'
import { content } from '../data/content'
import { transliterate } from './translit'

describe('автотранслитерация hayeren-latin-v1 (критерии 52–53)', () => {
  it('примеры из схемы', () => {
    expect(transliterate('բարև')).toBe('barev')
    expect(transliterate('հաց')).toBe("hats'")
    expect(transliterate('ջուր')).toBe('jur')
    expect(transliterate('կաթ')).toBe("kat'")
    expect(transliterate('հարյուր')).toBe('haryur')
    expect(transliterate('սենյակ')).toBe('senyak')
  })

  it('ե, ո, և в начале слова и в середине (правило 4)', () => {
    expect(transliterate('երկու')).toBe('yerku')
    expect(transliterate('ես')).toBe('yes')
    expect(transliterate('ոչ')).toBe("voch'")
    expect(transliterate('և')).toBe('yev')
    expect(transliterate('բարեւ')).toBe('barev')
    expect(transliterate('խնդրում եմ')).toBe('khndrum yem')
    expect(transliterate('պետք է')).toBe("petk' e")
  })

  it('«ու» — одна буква u, в том числе в начале слова', () => {
    expect(transliterate('ուղիղ')).toBe('ughigh')
    expect(transliterate('շնորհակալություն')).toBe("shnorhakalut'yun")
    expect(transliterate('Ուր')).toBe('ur')
  })

  it('регистр: результат в нижнем регистре (правило 7)', () => {
    expect(transliterate('Բարև')).toBe('barev')
    expect(transliterate('ԲԱՐԵՎ')).toBe('barev')
  })

  it('знаки препинания и цифры не переносятся (правило 6), дефис и пробелы сохраняются', () => {
    expect(transliterate('Ինչպե՞ս ես։')).toBe("inch'pes yes")
    expect(transliterate('Ո՞վ')).toBe('vov')
    expect(transliterate('լավ, բարի')).toBe('lav bari')
    expect(transliterate('  լավ   բարի ')).toBe('lav bari')
    expect(transliterate('ա-բ')).toBe('a-b')
    expect(transliterate('տուն (տ)')).toBe('tun t')
  })

  it('53: результат проходит проверку транслитерации (латиница, ə, апостроф, пробел, дефис)', () => {
    for (const w of content.words) {
      expect(transliterate(w.hy)).toMatch(/^[\p{Script=Latin}' -]+$/u)
    }
  })

  describe('53: сверка со всеми 88 словами словаря', () => {
    const hasYe = (hy: string) => hy.includes('ը')
    for (const w of content.words) {
      if (hasYe(w.hy)) {
        // (б) написано `ը`: автотранслитерация совпадает с translit без изменений.
        it(`${w.id} ${w.hy}: с буквой ը`, () => {
          expect(transliterate(w.hy)).toBe(w.translit)
        })
      } else {
        // (а) нет `ը`: все `ə` в словаре — вставки по правилу 3, генератор их не делает.
        it(`${w.id} ${w.hy}`, () => {
          expect(transliterate(w.hy)).toBe(w.translit.replaceAll('ə', ''))
        })
      }
    }
    it('в словаре 88 слов, из них с буквой ը — ինը и տասը', () => {
      expect(content.words).toHaveLength(88)
      expect(content.words.filter((w) => hasYe(w.hy)).map((w) => w.hy)).toEqual(['ինը', 'տասը'])
    })
  })

  it('53: буква ը в конце слова всегда даёт ə', () => {
    expect(transliterate('ինը')).toBe('inə')
    expect(transliterate('տասը')).toBe('tasə')
    expect(transliterate('ընկեր')).toBe('ənker')
  })
})
