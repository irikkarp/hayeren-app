import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'button, input, select, textarea, [href]'

/**
 * Поведение модального диалога (ui-kit 6.10): фон недоступен (`inert`), фокус сначала на
 * `initialFocus`, Tab зациклен внутри листа, Esc = отмена, по закрытии фокус возвращается.
 */
export function useModal(
  sheet: RefObject<HTMLElement | null>,
  initialFocus: RefObject<HTMLElement | null>,
  onCancel: () => void,
) {
  const cancelHandler = useRef(onCancel)

  useEffect(() => {
    cancelHandler.current = onCancel
  })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    initialFocus.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelHandler.current()
      } else if (e.key === 'Tab') {
        const items = sheet.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
        if (!items || items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      root?.removeAttribute('inert')
      opener?.focus()
    }
  }, [sheet, initialFocus])
}
