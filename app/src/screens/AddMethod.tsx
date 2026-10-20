import { useEffect } from 'react'
import { addPath } from '../domain/router'
import { useRoute } from '../router'
import { useStore } from '../store/context'
import { StorageNote } from '../ui/StorageNote'
import { TopBar } from '../ui/TopBar'

const METHODS = [
  {
    sub: 'paste',
    title: 'Вставить список',
    hint: 'Скопируйте слова из сообщения учителя',
  },
  {
    sub: 'word',
    title: 'Добавить по одному',
    hint: 'Для нового услышанного слова',
  },
  {
    sub: 'file',
    title: 'Импорт из файла (CSV, Excel)',
    hint: 'Файл .csv или .xlsx, в том числе копия из Hayeren',
  },
] as const

/** S09. Добавить слова: выбор способа (критерий 39). Вход в поток: прежний ввод сбрасывается. */
export function AddMethod() {
  const store = useStore()
  const { setParam } = useRoute()
  useEffect(() => store.resetAddFlow(), [store])

  return (
    <>
      <TopBar title="Добавить слова" />
      <main className="screen">
        <h2 className="t-heading">Как добавить?</h2>
        <ul className="list">
          {METHODS.map((m) => (
            <li key={m.sub}>
              <a className="row big-row" href={`#${addPath(m.sub, setParam)}`}>
                <span className="grow">
                  <span className="name">{m.title}</span>
                  <span className="muted t-small">{m.hint}</span>
                </span>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </a>
            </li>
          ))}
        </ul>
        <StorageNote />
      </main>
    </>
  )
}
