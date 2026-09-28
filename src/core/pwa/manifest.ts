import type { MetadataRoute } from 'next'
import type { AppDefinition } from '@/apps/types'
import { pick, type Locale } from '@/core/i18n/locale'

/**
 * Manifeste d'installation, dérivé du manifeste de l'IA. Rien à écrire en plus quand
 * une IA arrive : son nom, sa couleur et son icône viennent de `defineApp`.
 *
 * Le `scope` et le `start_url` sont ceux de l'IA : installée, une IA est une application à
 * elle seule, avec son nom et son icône sur l'écran d'accueil. C'est ce qui permet d'avoir
 * Rémy et Teinty côte à côte sur un téléphone sans qu'elles se confondent.
 *
 * `id` est fixe et indépendant de l'URL : changer `start_url` un jour ne créera pas une
 * deuxième installation à côté de la première.
 *
 * `start_url` emporte la langue choisie. Une application installée a son propre stockage,
 * séparé de celui du navigateur : le cookie de langue n'y est pas, et sans ce paramètre la
 * personne retrouverait l'anglais alors qu'elle avait choisi le français. Le manifeste étant
 * demandé avec les cookies, il connaît ce choix au moment de l'installation.
 *
 * `scope` n'a pas de barre oblique finale, sinon `/<slug>` lui-même en serait exclu (la
 * portée se compare comme un préfixe) et le navigateur refuserait le manifeste.
 */
export type WebManifest = MetadataRoute.Manifest

/** Icônes servies par `/pwa-icons/<slug>-<taille>.png` (rendues à la volée, mises en cache). */
export function iconSet(slug: string): WebManifest['icons'] {
  return [
    { src: `/pwa-icons/${slug}-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `/pwa-icons/${slug}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    // Icône adaptative Android : le système la recadre en cercle, en goutte ou en carré.
    // Elle est dessinée à bords perdus, le glyphe réduit pour survivre au recadrage.
    { src: `/pwa-icons/${slug}-512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]
}

export function appWebManifest(app: AppDefinition, locale: Locale): WebManifest {
  return {
    id: `/${app.slug}`,
    name: pick(app.name, locale),
    short_name: app.pwa.shortName,
    description: pick(app.tagline, locale),
    start_url: `/${app.slug}?lang=${locale}`,
    scope: `/${app.slug}`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: app.pwa.backgroundColor,
    theme_color: app.pwa.themeColor,
    lang: locale,
    dir: 'ltr',
    categories: [app.category],
    icons: iconSet(app.slug),
  }
}

/** Manifeste du hub : Flowear installé, c'est la vitrine, avec toutes les IA dedans. */
export function hubWebManifest(name: string, description: string, locale: Locale): WebManifest {
  return {
    id: '/',
    name,
    short_name: 'Flowear',
    description,
    start_url: `/?lang=${locale}`,
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#5E5CE6',
    lang: locale,
    dir: 'ltr',
    icons: iconSet('flowear'),
  }
}
