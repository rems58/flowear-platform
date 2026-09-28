import type { Repo } from '@/core/data/repo'

/** Délai promis par la politique de confidentialité entre la suppression du compte et l'effacement. */
export const PURGE_GRACE_DAYS = 30
const DAY_MS = 86_400_000
const BATCH = 100

/**
 * Efface pour de bon les comptes supprimés depuis plus de `PURGE_GRACE_DAYS` jours : contenu
 * (profils, souvenirs, conversations, productions, tâches, rappels, notifications, signalements),
 * puis ligne anonymisée (email, client Stripe) et marquée purgée. L'usage et les événements
 * restent pseudonymes pour la comptabilité. Rejouable : un compte purgé n'est plus sélectionné,
 * un échec est repris à l'appel suivant.
 */
export async function purgeDeletedUsers(repo: Repo, now = new Date()): Promise<{ purged: number; failed: number }> {
  const before = new Date(now.getTime() - PURGE_GRACE_DAYS * DAY_MS)
  const failedIds = new Set<string>()
  let purged = 0
  for (;;) {
    const batch = (await repo.users.listToPurge(before, BATCH)).filter((u) => !failedIds.has(u.clerkUserId))
    if (batch.length === 0) break
    for (const user of batch) {
      try {
        await repo.users.eraseContent(user.clerkUserId)
        await repo.users.anonymize(user.clerkUserId)
        await repo.users.markPurged(user.clerkUserId, now)
        purged++
      } catch (error) {
        console.error('[privacy.purge]', user.clerkUserId, error instanceof Error ? error.message : error)
        failedIds.add(user.clerkUserId)
      }
    }
    if (batch.length < BATCH) break
  }
  return { purged, failed: failedIds.size }
}
