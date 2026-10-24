import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { content } from './data/content'
import { MemoryRepository } from './storage/memoryRepository'
import { AppStore } from './store/appStore'

async function mount(repo = new MemoryRepository(true), clock = new Date(2026, 9, 19, 10, 0)) {
  const store = new AppStore({ openRepository: async () => repo, content, now: () => clock })
  void store.start()
  render(<App store={store} />)
  return { store, repo }
}

beforeEach(() => {
  window.location.hash = ''
})

describe('онбординг (критерии 1–4)', () => {
  it('первый запуск показывает выбор режима, выбор открывает главную, повторно онбординга нет', async () => {
    const { repo } = await mount()
    expect(
      await screen.findByRole('heading', { name: 'Как вы хотите заниматься?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Учу армянский с нуля/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Понимаю на слух/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Учу армянский с нуля/ }))
    expect(await screen.findByRole('heading', { name: 'Темы' })).toBeInTheDocument()
    expect((await repo.load()).settings?.mode).toBe('beginner')

    // Новый запуск с теми же данными: сразу главная.
    document.body.innerHTML = ''
    window.location.hash = ''
    await mount(repo)
    expect(await screen.findByRole('heading', { name: 'Темы' })).toBeInTheDocument()
    expect(screen.queryByText('Как вы хотите заниматься?')).not.toBeInTheDocument()
  })
})

describe('главная (критерии 6–8, 23, 110–113)', () => {
  async function home() {
    const ctl = await mount()
    fireEvent.click(await screen.findByRole('button', { name: /Учу армянский с нуля/ }))
    await screen.findByRole('heading', { name: 'Темы' })
    return ctl
  }

  it('6/7: шесть тем с прогрессом «выучено 0 из N»', async () => {
    await home()
    const rows = screen.getAllByRole('link', { name: /выучено 0 из/ })
    expect(rows).toHaveLength(6)
    expect(screen.getByText('Приветствия и вежливость')).toBeInTheDocument()
    const lines = rows.map((r) => r.querySelector('.pl')?.textContent)
    expect(lines.filter((l) => l === 'выучено 0 из 15')).toHaveLength(4)
    expect(lines.filter((l) => l === 'выучено 0 из 14')).toHaveLength(2)
  })

  it('23: плитки «Выучено 0 из 88» и «Повторить сегодня 0»; серия 0', async () => {
    await home()
    const progress = screen.getByRole('group', { name: 'Ваш прогресс' })
    expect(within(progress).getByText('из 88')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Серии нет/ })).toBeInTheDocument()
  })

  it('113: при N = 0 кнопка недоступна, причина видна и связана с кнопкой', async () => {
    await home()
    const button = screen.getByRole('button', { name: 'Повторить (0)' })
    expect(button).toBeDisabled()
    const note = screen.getByText('Пока нечего повторять: начните с любой темы')
    expect(button).toHaveAccessibleDescription('Пока нечего повторять: начните с любой темы')
    expect(note).toBeVisible()
  })

  it('B1: при недоступном хранилище виден баннер', async () => {
    await mount(new MemoryRepository(false))
    expect(
      await screen.findByText('Прогресс не сохранится: браузер запрещает хранение данных'),
    ).toBeInTheDocument()
  })
})

describe('сессия по теме (критерии 9–12, 15, 18, 21)', () => {
  it('карточка, ответ, итог', async () => {
    const { repo } = await mount()
    fireEvent.click(await screen.findByRole('button', { name: /Учу армянский с нуля/ }))
    fireEvent.click(await screen.findByRole('link', { name: /Приветствия и вежливость/ }))

    // Лицевая сторона: слово и транслитерация, перевода и кнопок ответа нет.
    expect(await screen.findByText('Осталось: 10')).toBeInTheDocument()
    expect(screen.getByText('բարև')).toBeInTheDocument()
    expect(screen.getByText('barev')).toBeInTheDocument()
    expect(screen.queryByText('привет')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Знаю/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Показать ответ' }))
    expect(screen.getByText('привет')).toBeInTheDocument()
    expect(screen.getByText('Բարև, ինչպե՞ս ես։')).toBeInTheDocument()

    // «Не знаю» → слово вернётся в конце; остальные «Знаю».
    fireEvent.click(screen.getByRole('button', { name: /Не знаю/ }))
    for (let i = 0; i < 9; i++) {
      fireEvent.click(await screen.findByRole('button', { name: 'Показать ответ' }))
      fireEvent.click(screen.getByRole('button', { name: /✓ Знаю|Знаю/ }))
    }
    // Последняя карточка — повтор («Ещё раз»).
    expect(await screen.findByText('Ещё раз')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Показать ответ' }))
    fireEvent.click(screen.getByRole('button', { name: /Знаю/ }))

    expect(await screen.findByRole('heading', { name: 'Хорошая работа!' })).toBeInTheDocument()
    const tiles = screen.getByRole('group', { name: 'Итог сессии' })
    expect(within(tiles).getByText('Пройдено').previousSibling).toHaveTextContent('10')
    expect(within(tiles).getByText('Знаю').previousSibling).toHaveTextContent('9')
    expect(within(tiles).getByText('Не знаю').previousSibling).toHaveTextContent('1')
    expect(screen.getByText('Серия растёт: 1 день подряд')).toBeInTheDocument()

    await act(async () => {})
    const snap = await repo.load()
    expect(snap.progress).toHaveLength(10)
    expect(snap.progress.find((p) => p.wordId === 'greetings-01')).toMatchObject({ box: 1 })
    expect(snap.progress.find((p) => p.wordId === 'greetings-02')).toMatchObject({ box: 2 })

    fireEvent.click(screen.getByRole('button', { name: 'К темам' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Темы' })).toBeInTheDocument())
    // Через день: 10 слов в долгах не сегодня (коробки 1 и 2 → завтра/послезавтра).
    expect(screen.getByRole('button', { name: 'Повторить (0)' })).toBeDisabled()
  })

  it('9: режим «читаю» скрывает транслитерацию до нажатия «Подсказка»', async () => {
    await mount()
    fireEvent.click(await screen.findByRole('button', { name: /Понимаю на слух/ }))
    fireEvent.click(await screen.findByRole('link', { name: /Приветствия и вежливость/ }))
    await screen.findByText('Осталось: 10')
    expect(screen.queryByText('barev')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Подсказка' }))
    expect(screen.getByText('barev')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Подсказка' })).not.toBeInTheDocument()
    // Ответ открывает транслитерацию во всех режимах.
    fireEvent.click(screen.getByRole('button', { name: 'Показать ответ' }))
    expect(screen.getByText('привет')).toBeInTheDocument()
  })
})

describe('алфавит и настройки', () => {
  it('32/33: таблица из 39 букв', async () => {
    await mount()
    fireEvent.click(await screen.findByRole('button', { name: /Учу армянский с нуля/ }))
    fireEvent.click(await screen.findByRole('link', { name: 'Алфавит' }))
    const table = await screen.findByRole('table', { name: 'Армянский алфавит' })
    expect(within(table).getAllByRole('row')).toHaveLength(40) // заголовок + 39 букв
  })

  it('35: сброс прогресса с подтверждением, отмена ничего не меняет', async () => {
    const { store } = await mount()
    fireEvent.click(await screen.findByRole('button', { name: /Учу армянский с нуля/ }))
    await screen.findByRole('heading', { name: 'Темы' })
    store.commitAnswer({
      progress: {
        wordId: 'greetings-01',
        box: 2,
        dueDate: '2026-10-21',
        lastReviewed: '2026-10-19',
        correct: 1,
        wrong: 0,
        updatedAt: 1,
        deletedAt: null,
      },
      wasNew: true,
      prevBox: null,
    })
    fireEvent.click(screen.getByRole('link', { name: 'Настройки' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Сбросить прогресс' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Сбросить прогресс?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(Object.keys(store.getState().progress)).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить прогресс' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Сбросить' }),
    )
    await waitFor(() => expect(Object.keys(store.getState().progress)).toHaveLength(0))
    expect(store.getState().settings?.mode).toBe('beginner')
  })
})
