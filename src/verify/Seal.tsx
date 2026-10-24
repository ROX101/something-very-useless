import { useId } from 'react'

export function Seal({ size = 96, initials, top, bottom }: { size?: number; initials: string; top: string; bottom: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${top} ${bottom} seal`} className="shrink-0">
      <defs>
        <path id={`t-${id}`} d="M 16 60 A 44 44 0 0 1 104 60" />
        <path id={`b-${id}`} d="M 9 60 A 51 51 0 0 0 111 60" />
      </defs>
      <circle cx="60" cy="60" r="58" fill="#5A1F2B" />
      <circle cx="60" cy="60" r="54.5" fill="none" stroke="#C9A24A" strokeWidth="1.6" />
      <circle cx="60" cy="60" r="36" fill="#FFFFFF" />
      <g fill="#FFFFFF" fontFamily="IBM Plex Sans, sans-serif" fontSize="8.6" fontWeight="600" letterSpacing="1.1">
        <text textAnchor="middle"><textPath href={`#t-${id}`} startOffset="50%">{top}</textPath></text>
        <text textAnchor="middle"><textPath href={`#b-${id}`} startOffset="50%">{bottom}</textPath></text>
      </g>
      <text x="60" y="67" textAnchor="middle" fill="#5A1F2B" fontFamily="IBM Plex Serif, Georgia, serif" fontSize="21" fontWeight="500">{initials}</text>
      <path d="M46 75 L60 81 L74 75" fill="none" stroke="#C9A24A" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
