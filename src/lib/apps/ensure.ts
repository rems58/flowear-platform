import 'server-only'
import { loadCreatorAppsInto } from '@/core/apps/load'
import { getRepo } from '@/lib/db/repo'

const TTL_MS = 60_000
let until = 0
let inflight: Promise<void> | null = null

/**
 * Remplit le magasin des IA créateurs, au plus une fois par minute et par processus.
 * À appeler en tête de chaque point d'entrée qui lit le registre ; les appels concurrents
 * partagent le même chargement. Une base injoignable garde le magasin tel quel : les IA
 * du code répondent toujours.
 */
export async function ensureAppsLoaded(): Promise<void> {
  if (Date.now() < until) return
  if (!inflight) {
    inflight = loadCreatorAppsInto(getRepo())
      .then(() => undefined)
      .catch((error) => console.error('[apps] chargement des IA créateurs impossible :', error instanceof Error ? error.message : error))
      .finally(() => {
        until = Date.now() + TTL_MS
        inflight = null
      })
  }
  await inflight
}

/** Admin : après une publication ou une suspension, le prochain appel recharge. */
export function invalidateApps(): void {
  until = 0
}
