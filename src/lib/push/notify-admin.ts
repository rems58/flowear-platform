import 'server-only'
import { ADMIN_PUSH_SLUG } from '@/core/admin/constants'
import type { PushPayload } from '@/core/push/nudge'
import { serializePayload } from '@/core/push/nudge'
import { getRepo } from '@/lib/db/repo'
import { getAdminIds } from '@/lib/env'
import { sendPush } from './send'

/**
 * Prévient l'admin sur son téléphone. Même mécanique que les relances : l'admin s'est
 * abonné depuis `/admin` sur le slug réservé, et chaque navigateur abonné reçoit le message.
 *
 * Jamais bloquant : un signalement doit être enregistré même si le push échoue, donc
 * l'appelant lance ceci sans l'attendre et les erreurs sont avalées après journalisation.
 */
export async function notifyAdmins(payload: PushPayload): Promise<void> {
  const repo = getRepo()
  const admins = getAdminIds()
  const all = await repo.push.listForApp(ADMIN_PUSH_SLUG)
  // Un administrateur retiré de la liste ne doit plus rien recevoir : son abonnement,
  // resté en base, est supprimé au premier envoi qui le croise.
  const stale = all.filter((s) => !admins.has(s.userId))
  await Promise.all(stale.map((s) => repo.push.remove(s.userId, ADMIN_PUSH_SLUG, s.endpoint)))
  const subscriptions = all.filter((s) => admins.has(s.userId))
  const body = serializePayload(payload)
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const result = await sendPush(subscription, body)
        if (result === 'expired') await repo.push.removeExpired(subscription.endpoint)
      } catch (error) {
        console.error('[push.admin]', error instanceof Error ? error.message : error)
      }
    })
  )
}
