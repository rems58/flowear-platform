import type { Metadata } from 'next'

/**
 * Icônes déclarées dans les métadonnées.
 *
 * Attention : dès qu'on renseigne `icons`, Next cesse de détecter tout seul les fichiers
 * `icon.*` et `apple-icon.*` du dossier. Il faut donc tout déclarer ici, sinon l'onglet
 * retombe sur `/favicon.ico` s'il en traîne un, ou sur rien.
 *
 * Le PNG vient du même dessin que le reste (`/pwa-icons/...`), donc l'onglet, l'écran
 * d'accueil et le hub ne peuvent pas diverger.
 */
export function flowearIcons(): Metadata['icons'] {
  return {
    // Le SVG d'abord : net à toutes les tailles. Le PNG sert aux navigateurs qui l'ignorent.
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/pwa-icons/flowear-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/pwa-icons/flowear-180.png',
  }
}

/** Sur une IA, l'onglet porte l'icône de l'IA, pas celle du hub. */
export function appIcons(slug: string): Metadata['icons'] {
  return {
    icon: [{ url: `/pwa-icons/${slug}-192.png`, type: 'image/png', sizes: '192x192' }],
    apple: `/pwa-icons/${slug}-180.png`,
  }
}
