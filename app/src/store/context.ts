import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AppState, AppStore } from './appStore'

export const StoreContext = createContext<AppStore | null>(null)

export function useStore(): AppStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('StoreContext не найден')
  return store
}

export function useAppState(): AppState {
  const store = useStore()
  return useSyncExternalStore(store.subscribe, store.getState)
}
