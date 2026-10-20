import { useMemo, useRef, useState } from 'react'
import { setsWord, wordsWord } from '../domain/plural'
import {
  buildPreviewItems,
  countNewSets,
  existingSets,
  planSave,
  type DefaultTarget,
  type PreviewContext,
  type PreviewItem,
} from '../domain/preview'
import { goBack, navigate, useRoute } from '../router'
import { useAppState, useStore } from '../store/context'
import { AutoChip } from '../ui/AutoChip'
import { Redirect } from '../ui/Redirect'
import { SetPicker } from '../ui/SetPicker'
import { TopBar } from '../ui/TopBar'
import { useToast } from '../ui/toastContext'
import { defaultSetTitle, validateSetTitle, type SetTitleError } from '../domain/wordValidation'

const PAGE = 100

function Row({
  item,
  checked,
  onToggle,
}: {
  item: PreviewItem
  checked: boolean
  onToggle: (value: boolean) => void
}) {
  const { row, duplicate } = item
  return (
    <li className={`pv-row${checked ? '' : ' is-off'}`}>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
        <span className="sr-only">
          Сохранить: {row.hy}
          {duplicate ? (duplicate.kind === 'file' ? ' (повтор)' : ' (уже есть)') : ''}
        </span>
      </label>
      <div className="pv-body">
        <div className="line">
          <span className="hy hy-list" lang="hy">
            {row.hy}
          </span>
          <span className="translit-sm">{item.translit}</span>
          {item.translitAuto && <AutoChip />}
        </div>
        <span>{row.ru}</span>
        {row.exampleHy && (
          <span className="pv-example hy t-small muted" lang="hy">
            {row.exampleHy}
          </span>
        )}
        {(row.setTitle || duplicate) && (
          <span className="line">
            {row.setTitle && (
              <span className="chip">
                {item.targetTitle}
                {item.isNewSet ? ' · новый набор' : ''}
              </span>
            )}
            {duplicate && (
              <span className="chip chip-warn">
                {duplicate.kind === 'file'
                  ? `⚠ Повтор строки ${duplicate.line}`
                  : '⚠ Уже есть в наборе'}
              </span>
            )}
          </span>
        )}
      </div>
    </li>
  )
}

/** S11. Предпросмотр (общий для вставки и файла): критерии 40, 44, 57, 62–65, 102–105. */
export function Preview() {
  const store = useStore()
  const { addFlow, userSets, userWords } = useAppState()
  const { setParam } = useRoute()
  const toast = useToast()
  const source = addFlow.preview
  const sets = useMemo(() => existingSets(userSets, userWords), [userSets, userWords])
  const defaultTitle = useMemo(() => defaultSetTitle(store.getNowDate()), [store])

  const [target, setTarget] = useState<DefaultTarget>(() =>
    setParam && userSets.some((s) => s.id === setParam)
      ? { type: 'existing', setId: setParam }
      : { type: 'new', title: defaultTitle },
  )
  const [overrides, setOverrides] = useState<Record<number, boolean>>({})
  const [visible, setVisible] = useState(PAGE)
  const [titleError, setTitleError] = useState<SetTitleError | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const ctx: PreviewContext = useMemo(() => ({ sets, defaultTarget: target }), [sets, target])
  const items = useMemo(
    () => (source ? buildPreviewItems(source.parsed.rows, ctx) : []),
    [source, ctx],
  )

  if (!source) return <Redirect to="/add" />
  const { parsed } = source
  const isChecked = (i: PreviewItem) => overrides[i.index] ?? i.duplicate === null
  const checked = items.filter(isChecked)
  const withSetColumn = source.source === 'file' && !!addFlow.mapping?.roles.includes('set')
  // Набор по умолчанию нужен, только если есть строки без своего названия набора.
  const usesDefaultSet = items.some((i) => !i.row.setTitle)
  const newSets = withSetColumn ? countNewSets(items) : 0
  const allExisting = items.length > 0 && items.every((i) => i.duplicate?.kind === 'existing')

  function setAll(value: boolean) {
    setOverrides(Object.fromEntries(items.map((i) => [i.index, value])))
  }

  async function save() {
    if (saving || checked.length === 0) return
    setSaveError(null)
    // Название нового набора проверяется заранее: ошибка показывается под полем.
    // Только если в набор по умолчанию реально попадает хотя бы одна отмеченная строка.
    if (target.type === 'new' && checked.some((i) => !i.row.setTitle)) {
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
    const res = planSave(
      checked,
      ctx,
      { setCount: userSets.length, wordCount: userWords.length },
      store.getNowDate().getTime(),
    )
    if (!res.ok) {
      if (res.error.kind === 'limit') setSaveError(res.error.message)
      else if (res.error.kind === 'title') setTitleError(res.error.error)
      return
    }
    setSaving(true)
    const ok = await store.saveUserWords(res.plan)
    setSaving(false)
    if (!ok) {
      setSaveError('Не удалось сохранить слова. Попробуйте ещё раз')
      return
    }
    const { plan } = res
    store.resetAddFlow()
    const n = plan.words.length
    if (plan.touchedSetIds.length === 1) {
      navigate(`/sets/${encodeURIComponent(plan.touchedSetIds[0])}`, { replace: true })
      toast.show(`Сохранено: ${n} ${wordsWord(n)} в «${plan.touchedTitles[0]}»`)
    } else {
      const k = plan.touchedSetIds.length
      navigate('/', { replace: true })
      toast.show(`Сохранено: ${n} ${wordsWord(n)}, ${k} ${setsWord(k)}`)
    }
  }

  const fromFile = source.source === 'file'
  return (
    <>
      <TopBar title="Проверьте список" />
      <main className="screen">
        <p>
          <strong>Распознано: {items.length}</strong>, с ошибками: {parsed.errors.length}, пустых
          строк пропущено: {parsed.skipped}
          {withSetColumn && <>. Новых наборов: {newSets}</>}
        </p>

        {allExisting && (
          <div className="banner banner-info">
            <span>
              Эти слова уже есть в приложении, поэтому они не отмечены. Отметьте строки, если хотите
              добавить их ещё раз.
            </span>
          </div>
        )}

        {usesDefaultSet && (
          <SetPicker
            sets={sets}
            value={target}
            onChange={(v) => {
              setTarget(v)
              setTitleError(null)
            }}
            label={withSetColumn ? 'Набор для строк без названия набора' : undefined}
            titleError={titleError}
            titleRef={titleRef}
            fallbackTitle={defaultTitle}
          />
        )}

        {items.length === 0 ? (
          <p className="banner banner-warn" role="status">
            <span>Ни одной строки не удалось распознать. Проверьте формат: «բարև — привет»</span>
          </p>
        ) : (
          <>
            <div className="section-head">
              <h2 className="t-heading">Слова</h2>
              <span>
                <button type="button" className="btn btn-text" onClick={() => setAll(true)}>
                  Отметить все
                </button>
                <button type="button" className="btn btn-text" onClick={() => setAll(false)}>
                  Снять отметки
                </button>
              </span>
            </div>
            <ul className="list" aria-label="Распознанные слова">
              {items.slice(0, visible).map((item) => (
                <Row
                  key={item.index}
                  item={item}
                  checked={isChecked(item)}
                  onToggle={(v) => setOverrides((o) => ({ ...o, [item.index]: v }))}
                />
              ))}
            </ul>
            {items.length > visible && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setVisible((v) => v + PAGE)}
              >
                Показать ещё {PAGE}
              </button>
            )}
          </>
        )}

        {parsed.errors.length > 0 && (
          <>
            <h2 className="t-heading">Строки с ошибками ({parsed.errors.length})</h2>
            <ul className="list">
              {parsed.errors.map((e) => (
                <li className="err-row" key={e.line}>
                  <span className="t-caption muted">Строка {e.line}</span>
                  <code>{e.raw}</code>
                  <span className="why">{e.reason}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <div className="stickybar">
        {saveError && (
          <div className="banner banner-err" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{saveError}</span>
          </div>
        )}
        {items.length > 0 && checked.length === 0 && (
          <p className="hint" id="pv-none">
            Отметьте хотя бы одно слово
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={checked.length === 0 || saving}
          aria-describedby={items.length > 0 && checked.length === 0 ? 'pv-none' : undefined}
          onClick={save}
        >
          {saving ? 'Сохраняем…' : `Сохранить ${checked.length} ${wordsWord(checked.length)}`}
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={goBack}>
          {fromFile ? 'Назад к колонкам' : 'Исправить текст'}
        </button>
      </div>
    </>
  )
}
