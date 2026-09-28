import { ADMIN_PUSH_SLUG } from '@/core/admin/constants'
import { SLUG_RE } from '@/core/security/sanitize'

/**
 * Slugs qu'une IA créateur ne peut pas prendre : ceux des IA du code, les chemins de
 * l'application (une IA « admin » masquerait l'admin) et le slug des notifications de l'admin.
 * Vérifié à la création du brouillon, et une deuxième fois au chargement du registre.
 */
export const CODE_APP_SLUGS = ['remy', 'amorce'] as const

export const ROUTE_SLUGS = ['admin', 'api', 'stats', 'studio', 'pricing', 'confidentialite', 'conditions', 'sign-in', 'sign-up', 'hors-ligne', 'pwa-icons', 'manifest.webmanifest', 'flowear', ADMIN_PUSH_SLUG] as const

const reserved: ReadonlySet<string> = new Set<string>([...CODE_APP_SLUGS, ...ROUTE_SLUGS])

export function isReservedSlug(slug: string): boolean {
  return reserved.has(slug) || slug.startsWith('flowear')
}

/** Lève si le slug est mal formé ou réservé. Le message est un `code` stable, traduit côté client. */
export function assertSlugAvailable(slug: string): void {
  if (!SLUG_RE.test(slug)) throw new Error('slug_invalid')
  if (isReservedSlug(slug)) throw new Error('slug_reserved')
}
