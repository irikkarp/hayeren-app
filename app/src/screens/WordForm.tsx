import { useId, useMemo, useRef, useState } from 'react'
import { emptyInput } from '../domain/parsedRows'
import {
  buildPreviewItems,
  existingSets,
  planSave,
  type DefaultTarget,
  type PreviewContext,
} from '../domain/preview'
import { normalizeText } from '../domain/text'
import { transliterate } from '../domain/translit'
import { translitFieldValue } from '../domain/userWords'
import {
  defaultSetTitle,
  firstErrorField,
  invalidArmenianChars,
  LIMITS,
  validateArmenian,
  normalizeWordInput,
  validateSetTitle,
  validateWordInput,
  type FieldErrors,
  type SetTitleError,
  type WordField,
  type WordInput,
} from '../domain/wordValidation'
import { goBack, navigate, useRoute } from '../router'
import { useAppState, useStore } from '../store/context'
import { ConfirmDialog } from '../ui/Dialog'
import { Redirect } from '../ui/Redirect'
import { SetPicker } from '../ui/SetPicker'
import { TopBar } from '../ui/TopBar'
import { useToast } from '../ui/toastContext'

interface FieldProps {
  id: string
  label: string
  optional?: boolean
  value: string
  error?: string
  hint?: string
  hy?: boolean
  onChange: (value: string) => void
  extra?: React.ReactNode
}

/** Одно поле формы: подпись, ввод, подсказка и ошибка под полем (ui-kit 6.3). */
function Field({ id, label, optional, value, error, hint, hy, onChange, extra }: FieldProps) {
  const errId = `${id}-err`
  const hintId = `${id}-hint`
  return (
    <div className={`field${error ? ' is-error' : ''}`}>
      <label htmlFor={id}>
        {label} {optional && <span className="opt">(необязательно)</span>}
      </label>
      <input
        id={id}
        className={`input${hy ? ' hy' : ''}`}
        lang={hy ? 'hy' : undefined}
        value={value}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? errId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined
        }
        onChange={(e) => onChange(e.target.value)}
      />
      {extra}
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error-text" id={errId}>
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

/** Строка «Как вы ввели» с подсвеченными недопустимыми символами (критерий 47). */
function HowTyped({ value }: { value: string }) {
  const bad = invalidArmenianChars(value)
  if (bad.length === 0) return null
  return (
    <p className="hint" aria-hidden="true">
      Как вы ввели:{' '}
      <span className="hy hy-small" lang="hy">
        {Array.from(value).map((ch, i) =>
          bad.includes(ch) ? (
            <span className="bad-char" key={i}>
              {ch}
            </span>
          ) : (
            ch
          ),
        )}
      </span>
    </p>
  )
}

const FIELD_IDS: Record<WordField, string> = {
  hy: 'wf-hy',
  ru: 'wf-ru',
  translit: 'wf-translit',
  exampleHy: 'wf-example-hy',
  exampleRu: 'wf-example-ru',
}

/** S12. Форма слова: добавить (`/add/word`) или изменить (`/sets/:id/words/:wordId`). */
export function WordForm({ editWordId }: { editWordId: string | null }) {
  const store = useStore()
  const { userSets, userWords } = useAppState()
  const { setParam } = useRoute()
  const toast = useToast()
  const uid = useId()
  const editing = editWordId !== null
  const word = editing ? userWords.find((w) => w.id === editWordId) : undefined
  const sets = useMemo(() => existingSets(userSets, userWords), [userSets, userWords])
  const defaultTitle = useMemo(() => defaultSetTitle(store.getNowDate()), [store])

  const [fields, setFields] = useState<WordInput>(() =>
    word
      ? {
          hy: word.hy,
          ru: word.ru,
          translit: translitFieldValue(word),
          exampleHy: word.exampleHy,
          exampleRu: word.exampleRu,
        }
      : emptyInput(),
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [target, setTarget] = useState<DefaultTarget>(() =>
    setParam && userSets.some((s) => s.id === setParam)
      ? { type: 'existing', setId: setParam }
      : userSets.length > 0
        ? { type: 'existing', setId: sets[0].id }
        : { type: 'new', title: defaultTitle },
  )
  const [titleError, setTitleError] = useState<SetTitleError | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dupOf, setDupOf] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lastSetId, setLastSetId] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  if (editing && !word) return <Redirect to="/" />

  const set = (field: WordField) => (value: string) => {
    setFields((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }
  const field = (name: WordField) => ({
    id: `${uid}${FIELD_IDS[name]}`,
    value: fields[name],
    error: errors[name],
    onChange: set(name),
  })

  // Подсказка «будет: barev, авто» под пустой транслитерацией (критерий 56).
  const suggestion =
    fields.translit.trim() === '' &&
    validateArmenian(normalizeText(fields.hy), LIMITS.hy, true) === null
      ? transliterate(fields.hy)
      : ''

  const focusField = (name: WordField) =>
    document.getElementById(`${uid}${FIELD_IDS[name]}`)?.focus()

  /** Нормализация и проверка полей; при ошибках показывает их и ставит фокус на первое поле. */
  function validate(): WordInput | null {
    const normalized = normalizeWordInput(fields)
    const found = validateWordInput(normalized)
    setErrors(found)
    const first = firstErrorField(found)
    if (first) {
      focusField(first)
      return null
    }
    return normalized
  }

  async function saveEdit() {
    const input = validate()
    if (!input || !word || saving) return
    setSaving(true)
    setBanner(null)
    const ok = await store.updateWord(word.id, input)
    setSaving(false)
    if (!ok) {
      setBanner('Не удалось сохранить слово. Попробуйте ещё раз')
      return
    }
    navigate(`/sets/${encodeURIComponent(word.setId)}`, { replace: true })
    toast.show('Изменения сохранены')
  }

  async function remove() {
    if (!word) return
    setConfirmDelete(false)
    if (await store.deleteWord(word.id)) {
      navigate(`/sets/${encodeURIComponent(word.setId)}`, { replace: true })
      toast.show('Слово удалено')
    } else setBanner('Не удалось удалить слово. Попробуйте ещё раз')
  }

  async function add(force: boolean) {
    if (saving) return
    const input = validate()
    if (!input) return
    setBanner(null)
    if (target.type === 'new') {
      const err = validateSetTitle(
        target.title,
        sets.map((s) => s.title),
      )
      if (err) {
        setTitleError(err)
        titleRef.current?.focus()
        return
      }
    }
    setTitleError(null)
    const ctx: PreviewContext = { sets, defaultTarget: target }
    const [item] = buildPreviewItems([{ line: 1, ...input, setTitle: null }], ctx)
    if (item.duplicate && !force) {
      setDupOf(item.targetTitle)
      return
    }
    const res = planSave(
      [item],
      ctx,
      { setCount: userSets.length, wordCount: userWords.length },
      store.getNowDate().getTime(),
    )
    if (!res.ok) {
      if (res.error.kind === 'limit') setBanner(res.error.message)
      return
    }
    setSaving(true)
    const ok = await store.saveUserWords(res.plan)
    setSaving(false)
    if (!ok) {
      setBanner('Не удалось сохранить слово. Попробуйте ещё раз')
      return
    }
    const setId = res.plan.touchedSetIds[0]
    toast.show(`Слово добавлено в «${res.plan.touchedTitles[0]}»`)
    // Форма очищается, выбранный набор остаётся (новый становится существующим), фокус в первое поле.
    setLastSetId(setId)
    setTarget({ type: 'existing', setId })
    setFields(emptyInput())
    setErrors({})
    focusField('hy')
  }

  function done() {
    if (lastSetId) navigate(`/sets/${encodeURIComponent(lastSetId)}`, { replace: true })
    else goBack()
  }

  const setTitle = word ? userSets.find((s) => s.id === word.setId)?.title : undefined

  return (
    <>
      <TopBar title={editing ? 'Изменить слово' : 'Добавить слово'} />
      <form
        className="screen"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (editing) void saveEdit()
          else void add(false)
        }}
      >
        <Field
          {...field('hy')}
          label="Армянское слово"
          hy
          extra={errors.hy ? <HowTyped value={fields.hy} /> : null}
        />
        <Field {...field('ru')} label="Перевод" />
        <Field
          {...field('translit')}
          label="Транслитерация"
          optional
          hint={
            suggestion
              ? `Оставьте пустым — создадим автоматически. Будет: ${suggestion}, авто`
              : 'Оставьте пустым — создадим автоматически'
          }
        />
        <Field {...field('exampleHy')} label="Пример (по-армянски)" optional hy />
        <Field {...field('exampleRu')} label="Перевод примера" optional />

        {editing ? (
          <div className="field">
            <span className="label">Набор</span>
            <p>{setTitle}</p>
          </div>
        ) : (
          <SetPicker
            sets={sets}
            value={target}
            onChange={(v) => {
              setTarget(v)
              setTitleError(null)
            }}
            label="Набор"
            titleError={titleError}
            titleRef={titleRef}
            fallbackTitle={defaultTitle}
          />
        )}
        <button type="submit" hidden />
      </form>
      <div className="stickybar">
        {banner && (
          <div className="banner banner-err" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{banner}</span>
          </div>
        )}
        {editing && (
          <button
            type="button"
            className="btn btn-danger-text"
            onClick={() => setConfirmDelete(true)}
          >
            Удалить слово
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={saving}
          onClick={() => (editing ? void saveEdit() : void add(false))}
        >
          Сохранить
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={editing ? goBack : done}
        >
          {editing ? 'Отмена' : 'Готово'}
        </button>
      </div>

      {dupOf !== null && (
        <ConfirmDialog
          title={`Это слово уже есть в наборе «${dupOf}»`}
          confirmLabel="Всё равно добавить"
          cancelLabel="Отмена"
          onConfirm={() => {
            setDupOf(null)
            void add(true)
          }}
          onCancel={() => {
            setDupOf(null)
            // Диалог возвращает фокус на кнопку при закрытии; поле «Армянское слово» берёт его после.
            setTimeout(() => focusField('hy'), 0)
          }}
        />
      )}
      {confirmDelete && word && (
        <ConfirmDialog
          title={`Удалить слово «${word.hy}»?`}
          description="Прогресс по слову тоже будет удалён."
          confirmLabel="Удалить"
          danger
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
