import type { CSSProperties } from 'react'
import { BRAND_IMAGE_RE } from '@/apps/types'

interface AppIconProps {
  brand: { from: string; to: string; glyph: string; mark?: string; image?: string }
  size?: number
  className?: string
}

/**
 * Icône d'app façon iOS : carré aux coins très arrondis, dégradé vif, glyphe blanc ou
 * logo dessiné (`brand.mark`, SVG du manifeste), léger reflet en haut. Aucune image à charger.
 */
export function AppIcon({ brand, size = 64, className = '' }: AppIconProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: size * 0.225,
    background: `linear-gradient(145deg, ${brand.from} 0%, ${brand.to} 100%)`,
    fontSize: size * 0.48,
    boxShadow: `0 ${size * 0.06}px ${size * 0.25}px ${brand.to}55, inset 0 1px 0 rgba(255,255,255,0.35)`,
  }
  return (
    <span
      aria-hidden
      style={style}
      className={`relative inline-flex shrink-0 select-none items-center justify-center font-semibold tracking-tight text-white ${className}`}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-[inherit]"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0))' }}
      />
      {brand.image && BRAND_IMAGE_RE.test(brand.image) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.image} alt="" width={size} height={size} className="relative size-full rounded-[inherit] object-cover" draggable={false} />
      ) : brand.mark ? (
        <svg viewBox="0 0 64 64" width={size} height={size} className="relative" aria-hidden focusable="false" dangerouslySetInnerHTML={{ __html: brand.mark }} />
      ) : (
        <span className="relative">{brand.glyph}</span>
      )}
    </span>
  )
}
