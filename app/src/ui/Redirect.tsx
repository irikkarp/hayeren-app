import { useEffect } from 'react'
import { navigate } from '../router'

/** Перенаправление без добавления записи в историю. */
export function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, { replace: true })
  }, [to])
  return null
}
