import { useId } from 'react'
import { INSTITUTION } from '../data/reference'

export function Crest({ size = 72 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  const small = size < 48
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${INSTITUTION.name} crest`} className="shrink-0">
      <defs>
        <path id={`top-${id}`} d="M 16 60 A 44 44 0 0 1 104 60" />
        <path id={`bot-${id}`} d="M 9 60 A 51 51 0 0 0 111 60" />
      </defs>
      <circle cx="60" cy="60" r="58" fill="#14235A" />
      <circle cx="60" cy="60" r="54.5" fill="none" stroke="#E07B1A" strokeWidth="1.6" />
      <circle cx="60" cy="60" r="36" fill="#FFFFFF" />
      {!small && (
        <g fill="#FFFFFF" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fontWeight="600" letterSpacing="1.2">
          <text textAnchor="middle"><textPath href={`#top-${id}`} startOffset="50%">ARANYA INSTITUTE</textPath></text>
          <text textAnchor="middle"><textPath href={`#bot-${id}`} startOffset="50%">OF TECHNOLOGY  {INSTITUTION.established}</textPath></text>
          <circle cx="12.5" cy="66" r="1.6" fill="#E07B1A" />
          <circle cx="107.5" cy="66" r="1.6" fill="#E07B1A" />
        </g>
      )}
      <path d="M60 34 L64 42 L60 40 L56 42 Z" fill="#E07B1A" />
      <text x="60" y="68" textAnchor="middle" fill="#14235A" fontFamily="IBM Plex Serif, Georgia, serif" fontSize="22" fontWeight="500">
        {INSTITUTION.initials}
      </text>
      <path d="M44 76 Q60 84 76 76" fill="none" stroke="#1D6F42" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
