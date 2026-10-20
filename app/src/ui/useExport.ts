import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store/context'

/** Сколько секунд держится сообщение об успешном экспорте (дизайн T1). */
const DONE_MS = 10_000

export type ExportStatus = 'done' | 'failed' | null

/**
 * Запуск экспорта из интерфейса (критерии 88, 99): `run` вызывается прямо из обработчика
 * нажатия. Пока файл готовится, `busy` = true («Готовим файл…»). Результат — `status`, его
 * показывает `ExportStatus` под кнопкой: успех на 10 секунд (можно закрыть), ошибка до
 * следующей удачной попытки или ухода с экрана. Отмена меню «Поделиться» молчит.
 */
export function useExport(setId?: string) {
  const store = useStore()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<ExportStatus>(null)

  useEffect(() => {
    if (status !== 'done') return
    const timer = window.setTimeout(() => setStatus(null), DONE_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  const run = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await store.exportWords(setId)
      if (res.status === 'ok') setStatus('done')
      else if (res.status === 'failed') setStatus('failed')
    } finally {
      setBusy(false)
    }
  }, [busy, store, setId])

  const close = useCallback(() => setStatus(null), [])
  return { run, busy, status, close }
}
