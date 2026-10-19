import { ALPHABET } from '../data/alphabet'
import { Bird } from '../ui/Icons'

/** S06. Справочник букв: без упражнений, на прогресс не влияет (критерии 32–33). */
export function Alphabet() {
  return (
    <main className="screen">
      <div className="alpha-head">
        <Bird />
        <div>
          <h1 className="t-title">Алфавит</h1>
          <p className="muted t-small">{ALPHABET.length} букв восточноармянского алфавита</p>
        </div>
      </div>
      <p>39 букв восточноармянского алфавита. Здесь только справочник, упражнений нет.</p>

      <details className="disclosure">
        <summary>Как читать транслитерацию</summary>
        <div className="body">
          <p>
            Знак ' после буквы означает придыхание: звук произносится «с выдохом». Пары p и p', t и
            t', k и k', ch и ch', ts и ts' — это разные буквы.
          </p>
          <p>ə — краткий безударный звук, похожий на «ы».</p>
        </div>
      </details>

      <table className="alpha-table">
        <caption>Армянский алфавит</caption>
        <thead>
          <tr>
            <th scope="col">Буква</th>
            <th scope="col">Транслитерация</th>
            <th scope="col">Как читать</th>
          </tr>
        </thead>
        <tbody>
          {ALPHABET.map((l) => (
            <tr key={l.lower}>
              <td>
                <span className="letters hy letter-xl" lang="hy">
                  {l.upper && <span>{l.upper}</span>}
                  <span>{l.lower}</span>
                </span>
              </td>
              <td>
                <span className="tr">{l.translit}</span>
                {l.note && <div className="muted t-small">{l.note}</div>}
              </td>
              <td>{l.hint}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
