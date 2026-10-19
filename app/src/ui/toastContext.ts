import { createContext, useContext } from 'react'

export interface ToastApi {
  /** Показывает тост; новый заменяет старый. По умолчанию исчезает через 4 секунды. */
  /** Убирает текущий тост (например, при уходе с экрана). */
  dismiss: () => void
  show: (message: string, options?: { durationMs?: number }) => void
}

export const ToastContext = createContext<ToastApi>({ show: () => {}, dismiss: () => {} })
export const useToast = (): ToastApi => useContext(ToastContext)
