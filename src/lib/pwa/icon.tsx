import { ImageResponse } from 'next/og'
import { BRAND_IMAGE_RE, type Brand } from '@/apps/types'

/**
 * Icônes d'installation, dessinées à la volée depuis la marque de l'IA. Aucune image
 * n'est déposée dans le dépôt : une nouvelle IA arrive avec son manifeste et ses icônes
 * existent, dans toutes les tailles, sur toutes les plateformes.
 *
 * Deux variantes. « any » reprend l'icône de l'app telle qu'elle est affichée dans le hub :
 * carré aux coins arrondis, dégradé, glyphe blanc. « maskable » est à bords perdus avec un
 * glyphe plus petit : Android la recadre en cercle ou en goutte selon le lanceur, et tout
 * ce qui dépasse de la zone sûre (40 % au centre) peut être coupé.
 */
export interface IconRequest {
  size: number
  maskable: boolean
}

/**
 * Tailles servies : 32 et 48 pour le favicon, 180 pour l'écran d'accueil iOS,
 * 192 et 512 pour le manifeste.
 */
export const ICON_SIZES = [32, 48, 180, 192, 512] as const

const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'

function response(element: React.ReactElement, size: number): ImageResponse {
  return new ImageResponse(element, { width: size, height: size, headers: { 'cache-control': CACHE } })
}

/** Logo dessiné d'une IA, en SVG intégré : fond dégradé et traits du manifeste. */
function markSvg(brand: Brand, mark: string, maskable: boolean): string {
  const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${brand.from}"/><stop offset="1" stop-color="${brand.to}"/></linearGradient></defs>`
  const background = maskable ? '<rect width="64" height="64" fill="url(#g)"/>' : '<rect width="64" height="64" rx="15" fill="url(#g)"/>'
  const content = maskable ? `<g transform="translate(32 32) scale(0.62) translate(-32 -32)">${mark}</g>` : mark
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${gradient}${background}${content}</svg>`
}

/** Icône d'une IA : le même dessin que `AppIcon`, en PNG. */
export function appIconImage(brand: Brand, { size, maskable }: IconRequest): ImageResponse {
  if (brand.image && BRAND_IMAGE_RE.test(brand.image)) {
    // Logo image d'un créateur : plein cadre, coins arrondis sauf en variante adaptative (Android
    // recadre lui-même), sur le dégradé pour les logos transparents.
    return response(
      (
        <div style={{ width: size, height: size, display: 'flex', overflow: 'hidden', borderRadius: maskable ? 0 : size * 0.225, background: `linear-gradient(145deg, ${brand.from} 0%, ${brand.to} 100%)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.image} width={size} height={size} alt="" style={{ objectFit: 'cover' }} />
        </div>
      ),
      size
    )
  }
  if (brand.mark) {
    const src = `data:image/svg+xml;base64,${Buffer.from(markSvg(brand, brand.mark, maskable)).toString('base64')}`
    return response(
      (
        <div style={{ width: size, height: size, display: 'flex' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} width={size} height={size} alt="" />
        </div>
      ),
      size
    )
  }
  return response(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: maskable ? 0 : size * 0.225,
          background: `linear-gradient(145deg, ${brand.from} 0%, ${brand.to} 100%)`,
          color: '#ffffff',
          fontSize: size * (maskable ? 0.34 : 0.48),
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        {brand.glyph}
      </div>
    ),
    size
  )
}

/**
 * Logo Flowear : même dessin que `FlowearLogo` et `src/app/icon.svg`, en SVG intégré
 * plutôt qu'en texte, pour qu'il ne dépende d'aucune police.
 */
function flowearSvg(maskable: boolean): string {
  // Le tracé est dessiné dans une grille de 64. En variante adaptative, on garde le fond
  // indigo à bords perdus et on réduit les vagues au centre pour survivre au recadrage.
  const waves = `
    <path d="M13 44c8 0 8-10 16-10s8 10 16 10 6-6 8-6" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    <path d="M13 32c8 0 8-10 16-10s8 10 16 10 6-6 8-6" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.75"/>
    <path d="M13 20c8 0 8-8 16-8s8 8 16 8 6-5 8-5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.5"/>`
  const background = maskable ? '<rect width="64" height="64" fill="#5E5CE6"/>' : '<rect width="64" height="64" rx="15" fill="#5E5CE6"/>'
  const content = maskable ? `<g transform="translate(32 32) scale(0.62) translate(-32 -32)">${waves}</g>` : waves
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${background}${content}</svg>`
}

export function flowearIconImage({ size, maskable }: IconRequest): ImageResponse {
  const src = `data:image/svg+xml;base64,${Buffer.from(flowearSvg(maskable)).toString('base64')}`
  return response(
    (
      <div style={{ width: size, height: size, display: 'flex' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={size} height={size} alt="" />
      </div>
    ),
    size
  )
}
