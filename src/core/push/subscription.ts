import { z } from 'zod'
import { SUPPORTED_LOCALES } from '@/core/i18n/locale'

/**
 * Abonnement push tel que le navigateur le fabrique (`PushSubscription.toJSON()`).
 * Il arrive du client, donc il est validé comme n'importe quelle entrée.
 *
 * Deux règles tiennent la sécurité :
 * 1. l'endpoint doit être une URL https d'un service de push connu. Sans ce filtre,
 *    n'importe qui pourrait nous faire poster vers l'URL de son choix, à la demande,
 *    depuis notre serveur : une falsification de requête côté serveur (SSRF).
 * 2. les clés sont du base64url borné : elles partent telles quelles à web-push.
 */
const SERVICE_HOSTS = [
  // Apple (Safari, iOS ajouté à l'écran d'accueil)
  /\.push\.apple\.com$/,
  // Chrome, Edge, Brave, Opera, Samsung Internet
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  // Firefox
  /\.push\.services\.mozilla\.com$/,
  // Edge hérité
  /\.notify\.windows\.com$/,
]

/** `true` si l'endpoint est bien servi par un service de push de navigateur. */
export function isPushEndpoint(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return SERVICE_HOSTS.some((re) => re.test(url.hostname))
}

const base64url = z
  .string()
  .min(16)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+=*$/, 'clé invalide')

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine(isPushEndpoint, 'endpoint de push non reconnu'),
  keys: z.object({ p256dh: base64url, auth: base64url }),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
})

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>

/** Désabonnement : seul l'endpoint est nécessaire, la propriété est vérifiée côté base. */
export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) })
