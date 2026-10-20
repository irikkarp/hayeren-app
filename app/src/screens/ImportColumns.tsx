import { useState } from 'react'
import {
  applyMapping,
  dataRowCount,
  mappingProblems,
  ROLES,
  tooManyRowsMessage,
  MAX_FILE_ROWS,
  type Role,
} from '../domain/importFile'
import { rereadCsv, type DelimiterChoice } from '../data/readImportFile'
import { detectMapping } from '../domain/importFile'
import { rowsWord } from '../domain/plural'
import { addPath } from '../domain/router'
import { navigate, useRoute } from '../router'
import { useAppState, useStore } from '../store/context'
import { Redirect } from '../ui/Redirect'
import { TopBar } from '../ui/TopBar'

/** A, B, … Z, AA, AB… */
function columnLabel(i: number): string {
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

const PREVIEW_ROWS = 5

const delimiterName = (d: string) =>
  d === ';' ? 'точка с запятой' : d === ',' ? 'запятая' : 'табуляция'

/** S14. Импорт: сопоставление колонок (критерии 73–78, 101). */
export function ImportColumns() {
  const store = useStore()
  const { addFlow } = useAppState()
  const { setParam } = useRoute()
  const [sizeError, setSizeError] = useState<string | null>(null)
  const [delimError, setDelimError] = useState<string | null>(null)
  const { file, mapping } = addFlow
  if (!file || !mapping) return <Redirect to={addPath('file', setParam)} />

  const choice: DelimiterChoice = file.delimiterChoice ?? 'auto'
  const cols = mapping.roles.length
  const shown = file.rows.slice(0, PREVIEW_ROWS)
  const problems = mappingProblems(mapping.roles)
  const total = file.rows.length

  function setRole(col: number, role: Role) {
    const roles = mapping!.roles.map((r, i) => (i === col ? role : r))
    store.setAddFlow({ mapping: { ...mapping!, roles } })
    setSizeError(null)
  }

  function changeDelimiter(value: DelimiterChoice) {
    if (!file?.csvText) return
    const res = rereadCsv(file.csvText, value)
    if (!res.ok) {
      setDelimError(res.error)
      return
    }
    setDelimError(null)
    setSizeError(null)
    store.setAddFlow({
      file: { ...file, rows: res.rows, delimiter: res.delimiter, delimiterChoice: value },
      mapping: detectMapping(res.rows),
    })
  }

  function next() {
    if (!file || !mapping || problems.length > 0) return
    const data = dataRowCount(file.rows, mapping.hasHeader)
    if (data > MAX_FILE_ROWS) {
      setSizeError(tooManyRowsMessage(data))
      return
    }
    const parsed = applyMapping(file.rows, mapping.roles, mapping.hasHeader)
    store.setAddFlow({ preview: { source: 'file', fileName: file.name, parsed } })
    navigate(addPath('preview', setParam))
  }

  return (
    <>
      <TopBar title="Что в колонках" />
      <main className="screen">
        {file.multiSheet && file.sheetName && (
          <div className="banner banner-info" role="status">
            <span>Импортирован первый лист «{file.sheetName}»</span>
          </div>
        )}
        <p className="muted t-small">
          Файл «{file.name}». Показаны первые {Math.min(PREVIEW_ROWS, total)}{' '}
          {rowsWord(Math.min(PREVIEW_ROWS, total))} из {total}.
        </p>
        {file.csvText !== null && (
          <div className="field">
            <label htmlFor="csv-delimiter">Разделитель в файле</label>
            <select
              id="csv-delimiter"
              className="select"
              value={choice}
              onChange={(e) => changeDelimiter(e.target.value as DelimiterChoice)}
            >
              <option value="auto">
                Определить автоматически
                {choice === 'auto' && file.delimiter ? ` (${delimiterName(file.delimiter)})` : ''}
              </option>
              <option value=";">Точка с запятой ;</option>
              <option value=",">Запятая ,</option>
              <option value={'\t'}>Табуляция</option>
            </select>
            {delimError && (
              <p className="error-text" role="alert">
                <span aria-hidden="true">⚠</span>
                <span>{delimError}</span>
              </p>
            )}
          </div>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={mapping.hasHeader}
            onChange={(e) => {
              store.setAddFlow({ mapping: { ...mapping, hasHeader: e.target.checked } })
              setSizeError(null)
            }}
          />
          Первая строка — заголовки
        </label>

        <div className="map-scroll" tabIndex={0} role="region" aria-label="Первые строки файла">
          <table className="map-table">
            <thead>
              <tr>
                {Array.from({ length: cols }, (_, c) => (
                  <th scope="col" key={c}>
                    <span className="colname">Колонка {columnLabel(c)}</span>
                    <select
                      className="select"
                      aria-label={`Роль колонки ${columnLabel(c)}`}
                      value={mapping.roles[c]}
                      onChange={(e) => setRole(c, e.target.value as Role)}
                    >
                      {ROLES.map((r) => (
                        <option key={r.role} value={r.role}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, r) => (
                <tr key={r} className={r === 0 && mapping.hasHeader ? 'is-header' : undefined}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} lang={/[Ա-և]/.test(row[c] ?? '') ? 'hy' : undefined}>
                      {row[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {mapping.detectedBy === 'headers' ? (
          <div className="banner banner-ok" role="status">
            <span aria-hidden="true">✓</span>
            <span>Колонки определены по заголовкам. Проверьте и нажмите «Далее».</span>
          </div>
        ) : (
          <div className="banner banner-info" role="status">
            <span>Заголовков не нашли, колонки определены по содержимому. Проверьте выбор.</span>
          </div>
        )}
      </main>

      <div className="stickybar">
        {problems.length > 0 && (
          <div className="banner banner-err" role="alert">
            <span aria-hidden="true">⚠</span>
            <ul className="plain-list">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {sizeError && (
          <div className="banner banner-err" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{sizeError}</span>
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={problems.length > 0}
          onClick={next}
        >
          Далее
        </button>
      </div>
    </>
  )
}
