import { useLayoutEffect, useRef } from 'react'
import { heroSizeClass } from '../domain/text'

const MIN_PX = 24

/**
 * Армянское слово на карточке (`hy-hero`, ui-kit 3.3). Кегль выбирается по длине самого длинного
 * слова; если слово всё равно шире карточки (узкий экран, крупный системный шрифт), кегль
 * уменьшается шагом 2px до 24px. Переносов внутри слова и обрезки нет.
 */
export function HeroWord({ hy }: { hy: string }) {
  const ref = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      let size = parseFloat(getComputedStyle(el).fontSize)
      while (el.scrollWidth > el.clientWidth && size > MIN_PX) {
        size -= 2
        el.style.fontSize = `${size}px`
      }
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [hy])

  return (
    <p ref={ref} className={`hy hy-hero ${heroSizeClass(hy)}`} lang="hy">
      {hy}
    </p>
  )
}
