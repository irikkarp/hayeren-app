import { useEffect } from 'react'
import { targetPath } from './domain/router'
import { useRoute } from './router'
import { Alphabet } from './screens/Alphabet'
import { Home } from './screens/Home'
import { Result } from './screens/Result'
import { SessionScreen } from './screens/Session'
import { Settings } from './screens/Settings'
import { Welcome } from './screens/Welcome'
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
