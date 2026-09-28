import 'server-only'
import webpush, { WebPushError } from 'web-push'
import type { PushSubscriptionRecord } from '@/core/data/types'
import { getServerEnv, isPushConfigured } from '@/lib/env'

/**
 * Envoi d'une notification push. Le contenu est chiffré par la bibliothèque avec les clés
 * du navigateur : le service de push (Apple, Google, Mozilla) transporte sans pouvoir lire.
 *
 * Trois issues seulement, comme pour l'email : envoyé, sauté (pas configuré), ou périmé.
 * « Périmé » veut dire que le navigateur a jeté l'abonnement, l'appelant doit alors
 * supprimer la ligne, sinon on écrirait dans le vide à chaque relance.
 */
export type PushResult = 'sent' | 'skipped' | 'expired'

let configured = false

function configure(): boolean {
  if (configured) return true
  const env = getServerEnv()
  if (!isPushConfigured(env)) return false
  webpush.setVapidDetails(env.VAPID_SUBJECT as string, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string, env.VAPID_PRIVATE_KEY as string)
  configured = true
  return true
}

export async function sendPush(subscription: Pick<PushSubscriptionRecord, 'endpoint' | 'keys'>, payload: string): Promise<PushResult> {
  if (!configure()) return 'skipped'
  try {
    await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, {
      // Une relance qui n'a pas pu être livrée en douze heures n'a plus d'intérêt.
      TTL: 43_200,
      urgency: 'low',
    })
    return 'sent'
  } catch (error) {
    if (isGone(error)) return 'expired'
    throw error
  }
}

/**
 * 404 et 410 : le navigateur a révoqué l'abonnement (notifications refusées, application
 * désinstallée, données du site effacées). C'est la seule réponse qui autorise à supprimer
 * la ligne ; une erreur 5xx est passagère et ne doit rien détruire.
 */
export function isGone(error: unknown): boolean {
  return error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)
}

/** Réservé aux tests : oublie la configuration VAPID mémorisée. */
export function resetPushConfig(): void {
  configured = false
}
