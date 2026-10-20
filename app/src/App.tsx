import { useEffect } from 'react'
import { targetPath, type Route } from './domain/router'
import { useRoute } from './router'
import { FEATURES } from './features'
import { AddMethod } from './screens/AddMethod'
import { Alphabet } from './screens/Alphabet'
import { Home } from './screens/Home'
import { ImportColumns } from './screens/ImportColumns'
import { ImportFile } from './screens/ImportFile'
import { Paste } from './screens/Paste'
import { Preview } from './screens/Preview'
import { Result } from './screens/Result'
import { SessionScreen } from './screens/Session'
import { SetScreen } from './screens/SetScreen'
import { Settings } from './screens/Settings'
import { Welcome } from './screens/Welcome'
import { WordForm } from './screens/WordForm'
import type { AppStore } from './store/appStore'
import { StoreContext, useAppState, useStore } from './store/context'
import { Sprite } from './ui/Icons'
import { Redirect } from './ui/Redirect'
import { TabBar } from './ui/TabBar'
import { ToastProvider } from './ui/ToastProvider'

/** Пересчитывает «сегодня» при возврате в приложение и в полночь (критерий 112). */
function useMidnightRefresh(store: AppStore) {
  useEffect(() => {
    let timer = 0
    const arm = () => {
      const now = new Date()
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      timer = window.setTimeout(() => {
        store.refreshToday()
        arm()
      }, midnight.getTime() - now.getTime())
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') store.refreshToday()
    }
    arm()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [store])
}

/** Экраны своих слов (этап 2): набор, форма, вставка, импорт. */
function userScreen(route: Route) {
  switch (route.name) {
    case 'set':
      return <SetScreen key={route.setId} setId={route.setId} />
    case 'wordEdit':
      return <WordForm key={route.wordId} editWordId={route.wordId} />
    case 'add':
      return <AddMethod />
    case 'addPaste':
      return <Paste />
    case 'addWord':
      return <WordForm key="new" editWordId={null} />
    case 'addFile':
      return <ImportFile />
    case 'addColumns':
      return <ImportColumns />
    default:
      return <Preview />
  }
}

function Shell() {
  const store = useStore()
  const state = useAppState()
  const { route } = useRoute()
  useMidnightRefresh(store)

  let screen
  if (state.phase === 'loading') {
    // Настройки ещё читаются: онбординг не мигает (критерий 4).
    screen = <div className="splash">Hayeren</div>
  } else if (state.phase === 'error') {
    screen = (
      <main className="screen">
        <div className="banner banner-err" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>Не удалось открыть данные приложения. Обновите страницу.</span>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => window.location.reload()}
        >
          Обновить
        </button>
      </main>
    )
  } else if (!state.settings) {
    screen = route.name === 'welcome' ? <Welcome /> : <Redirect to="/welcome" />
  } else {
    switch (route.name) {
      case 'home':
        screen = <Home />
        break
      case 'alphabet':
        screen = <Alphabet />
        break
      case 'settings':
        screen = <Settings />
        break
      case 'session':
        screen = (
          <SessionScreen
            key={`${targetPath(route.target)}#${state.sessionNonce}`}
            target={route.target}
          />
        )
        break
      case 'result':
        screen = <Result />
        break
      case 'set':
      case 'wordEdit':
      case 'add':
      case 'addPaste':
      case 'addWord':
      case 'addFile':
      case 'addColumns':
      case 'addPreview':
        screen = FEATURES.userSets ? userScreen(route) : <Redirect to="/" />
        break
      default:
        screen = <Redirect to="/" />
    }
  }

  const showTabs =
    state.phase === 'ready' &&
    !!state.settings &&
    (route.name === 'home' || route.name === 'alphabet' || route.name === 'settings')

  return (
    <div className="app-root">
      {!state.persistent && (
        <div className="banner banner-warn banner-top" role="status">
          <span aria-hidden="true">⚠</span>
          <span>Прогресс не сохранится: браузер запрещает хранение данных</span>
        </div>
      )}
      {screen}
      {showTabs && <TabBar route={route} />}
    </div>
  )
}

export default function App({ store }: { store: AppStore }) {
  return (
    <StoreContext.Provider value={store}>
      <Sprite />
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreContext.Provider>
  )
}
