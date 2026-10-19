import spriteSvg from '../assets/sprite.svg?raw'

/** SVG-спрайт: птицепись, хачкар, гранат, аревахач, значки тем. Вставляется в страницу один раз. */
export function Sprite() {
  return <div dangerouslySetInnerHTML={{ __html: spriteSvg }} />
}

/** Узор аревахач на фоне блока (прозрачность задаёт CSS-класс `pat`). */
export function Pattern() {
  return (
    <svg className="pat" aria-hidden="true" focusable="false">
      <rect width="100%" height="100%" fill="url(#arev)" />
    </svg>
  )
}

export function Bird({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'bird'}
      viewBox="-4 -6 108 106"
      aria-hidden="true"
      focusable="false"
    >
      <use href="#bird-a" />
    </svg>
  )
}

export function Khachkar({
  size = 40,
  className = 'khach',
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <use href="#khach" />
    </svg>
  )
}

export function Pomegranate({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <use href="#pom" />
    </svg>
  )
}

/** Пустая ячейка серии: штриховой контур следующего граната. */
export function PomegranateOutline({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
      style={{ color: 'var(--color-border-strong)' }}
    >
      <circle
        cx="20"
        cy="24"
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 3"
      />
    </svg>
  )
}

export function TopicIcon({ topicId, size = 40 }: { topicId: string; size?: number }) {
  return (
    <svg
      className={`ic ic-${topicId}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#i-${topicId}`} />
    </svg>
  )
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...stroke}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  )
}

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...stroke}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
    </svg>
  )
}

export function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
      {...stroke}
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}
