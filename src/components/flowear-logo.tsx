import type { CSSProperties } from 'react'

/**
 * Logo Flowear : carré arrondi indigo, trois vagues blanches qui montent vers la droite,
 * le « flow ». Une seule couleur, pas de dégradé. Même dessin que `src/app/icon.svg`.
 */
export function FlowearLogo({ size = 24, className = '', style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} style={style} aria-hidden focusable="false">
      <rect width="64" height="64" rx="15" fill="#5E5CE6" />
      <path d="M13 44c8 0 8-10 16-10s8 10 16 10 6-6 8-6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M13 32c8 0 8-10 16-10s8 10 16 10 6-6 8-6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.75" />
      <path d="M13 20c8 0 8-8 16-8s8 8 16 8 6-5 8-5" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}
