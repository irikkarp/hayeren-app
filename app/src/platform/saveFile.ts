/**
 * Сохранение текстового файла на устройстве пользователя (критерии 99, 109). Всё происходит
 * локально, без сети.
 *
 * Выбор способа:
 * - обычный браузер (Chrome, Edge, Firefox, Safari на macOS и iOS): Blob + `<a download>`;
 *   Safari на iOS показывает окно «Загрузки» / «Сохранить в Файлы»;
 * - PWA на iOS (режим standalone): `<a download>` с blob там работает ненадёжно (файл открывается
 *   во внутреннем просмотрщике без выхода), поэтому, если браузер умеет делиться файлами
 *   (`navigator.canShare({ files })`), открывается системное меню «Поделиться» (Web Share API);
 *   если не умеет, остаётся запасной `<a download>`;
 * - если «Поделиться» отклонено не пользователем (например, потерян жест нажатия), тоже
 *   используется `<a download>`.
 * Вызывать нужно сразу из обработчика нажатия, до любых `await`: иначе iOS не даст открыть меню.
 */
export type SaveOutcome = 'saved' | 'cancelled'

export type SaveFile = (fileName: string, text: string) => Promise<SaveOutcome>

const MIME = 'text/csv;charset=utf-8'

interface IosNavigator extends Navigator {
  standalone?: boolean
}

function isStandalone(): boolean {
  try {
    return (
      (navigator as IosNavigator).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    )
  } catch {
    return false
  }
}

function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ выдаёт себя за Mac, но у него есть мультитач.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

function downloadViaLink(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Браузеру нужно время, чтобы начать загрузку, прежде чем освободить адрес.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const saveTextFile: SaveFile = async (fileName, text) => {
  const blob = new Blob([text], { type: MIME })
  if (isIos() && isStandalone() && typeof navigator.canShare === 'function') {
    const file = new File([blob], fileName, { type: 'text/csv' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName })
        return 'saved'
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
        // иначе пробуем обычную загрузку
      }
    }
  }
  downloadViaLink(fileName, blob)
  return 'saved'
}
