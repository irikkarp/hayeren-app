import { useLayoutEffect, useRef } from 'react'
import { heroSizeClass } from '../domain/text'

const MIN_PX = 24

/**
 * Армянское слово на карточке (`hy-hero`, ui-kit 3.3). Кегль выбирается по длине самого длинного
 * слова; если слово всё равно шире карточки (узкий экран, крупный системный шрифт), кегль
 * уменьшается шагом 2px до 24px; если и так не помещается, слово переносится в любом месте.
 */
export function HeroWord({ hy }: { hy: string }) {
  const ref = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      el.style.overflowWrap = ''
      el.style.wordBreak = ''
      let size = parseFloat(getComputedStyle(el).fontSize)
      while (el.scrollWidth > el.clientWidth && size > MIN_PX) {
        size -= 2
        el.style.fontSize = `${size}px`
      }
      // Даже на минимальном кегле не помещается (очень длинное своё слово): перенос в любом месте,
      // чтобы не было горизонтальной прокрутки.
      if (el.scrollWidth > el.clientWidth) {
        el.style.overflowWrap = 'anywhere'
        el.style.wordBreak = 'break-all'
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
