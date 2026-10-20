import { useId, type Ref } from 'react'
import type { ExistingSet, DefaultTarget } from '../domain/preview'
import { SET_TITLE_MESSAGES, type SetTitleError } from '../domain/wordValidation'

const NEW = '__new__'

interface Props {
  sets: readonly ExistingSet[]
  value: DefaultTarget
  onChange: (value: DefaultTarget) => void
  /** Подпись списка (по умолчанию «Сохранить в набор»). */
  label?: string
  /** Ошибка названия нового набора (критерий 40). */
  titleError?: SetTitleError | null
  titleRef?: Ref<HTMLInputElement>
  /** Название, подставляемое при выборе «Новый набор…», если поле пусто. */
  fallbackTitle: string
}

/**
 * Выбор набора (критерий 40): существующий или «Новый набор…» с полем названия. Если наборов ещё
 * нет, список не показывается, сразу поле названия.
 */
export function SetPicker({
  sets,
  value,
  onChange,
  label,
  titleError,
  titleRef,
  fallbackTitle,
}: Props) {
  const selectId = useId()
  const titleId = useId()
  const errId = useId()
  const selected = value.type === 'existing' ? value.setId : NEW
  const isNew = value.type === 'new'

  return (
    <>
      {sets.length > 0 && (
        <div className="field">
          <label htmlFor={selectId}>{label ?? 'Сохранить в набор'}</label>
          <select
            id={selectId}
            className="select"
            value={selected}
            onChange={(e) =>
              onChange(
                e.target.value === NEW
                  ? { type: 'new', title: value.type === 'new' ? value.title : fallbackTitle }
                  : { type: 'existing', setId: e.target.value },
              )
            }
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
            <option value={NEW}>Новый набор…</option>
          </select>
        </div>
      )}
      {isNew && (
        <div className={`field${titleError ? ' is-error' : ''}`}>
          <label htmlFor={titleId}>Название нового набора</label>
          <input
            id={titleId}
            ref={titleRef}
            className="input"
            value={value.title}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? errId : undefined}
            onChange={(e) => onChange({ type: 'new', title: e.target.value })}
          />
          {titleError && (
            <p className="error-text" id={errId}>
              <span aria-hidden="true">⚠</span>
              <span>{SET_TITLE_MESSAGES[titleError]}</span>
            </p>
          )}
        </div>
      )}
    </>
  )
}
