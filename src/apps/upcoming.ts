import type { CategoryId } from './types'
import type { LocalizedText } from '@/core/i18n/locale'

/**
 * IA annoncées sur le hub avant leur sortie : elles donnent l'échelle Flowear dès le premier écran.
 * Une carte « Bientôt », pas de lien. À retirer d'ici quand le manifeste réel existe.
 */
export interface UpcomingApp {
  slug: string
  name: string
  tagline: LocalizedText
  category: CategoryId
  brand: { from: string; to: string; glyph: string; mark?: string }
}

const STROKE = 'fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"'
/** Logo Teinty : une goutte de sérum tracée, avec son reflet. Même langage que Flowear et Amorce, grille de 64. */
export const TEINTY_MARK = `<path d="M32 13c-8 11-14 18-14 26a14 14 0 0 0 28 0c0-8-6-15-14-26z" ${STROKE}/><path d="M25 39a7 7 0 0 0 6 6" ${STROKE} opacity="0.6"/>`

export const UPCOMING_APPS: readonly UpcomingApp[] = [
  {
    slug: 'teinty',
    name: 'Teinty',
    tagline: {
      en: 'Skincare that knows your skin.',
      fr: 'Le skincare qui connaît ta peau.',
      es: 'Skincare que conoce tu piel.',
      de: 'Hautpflege, die deine Haut kennt.',
      it: 'Skincare che conosce la tua pelle.',
    },
    category: 'beauty',
    brand: { from: '#FF9A8B', to: '#FF6A88', glyph: 'T', mark: TEINTY_MARK },
  },
]
