import { useId, useState } from 'react'

export const AUTO_HINT =
  'Транслитерация создана автоматически и может быть неточной. Её можно исправить в слове.'

/** Метка «авто» (критерий 54): по нажатию показывает подсказку о том, что транслитерация авто. */
export function AutoChip() {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <>
      <button
        type="button"
        className="chip chip-auto"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        авто
      </button>
      {open && (
        <span className="auto-hint" id={id} role="status">
          {AUTO_HINT}
        </span>
      )}
    </>
  )
}
