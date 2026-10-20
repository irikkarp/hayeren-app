import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ToastContext } from './toastContext'

interface Toast {
  id: number
  message: string
  durationMs: number
  /** Адрес в момент показа: при любой смене маршрута тост закрывается. */
  hash: string
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)

  const show = useCallback((message: string, options: { durationMs?: number } = {}) => {
    setToast((prev) => ({
      id: (prev?.id ?? 0) + 1,
      message,
      durationMs: options.durationMs ?? 4000,
      hash: window.location.hash,
    }))
  }, [])

  const dismiss = useCallback(() => setToast(null), [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), toast.durationMs)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!toast) return
    const onChange = () => {
      if (window.location.hash !== toast.hash) setToast(null)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [toast])

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-host">
        {toast && (
          <div className="toast" role="status" key={toast.id}>
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
