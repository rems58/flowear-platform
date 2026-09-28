import 'server-only'
import { getRepo } from '@/lib/db/repo'
import { canSeePrivateApps as fromEnv, getAdminIds } from '@/lib/env'

/**
 * Qui voit une IA privée : les administrateurs et testeurs de la variable d'environnement
 * (amorçage), plus les testeurs cochés depuis l'admin (base). La variable évite la base
 * pour l'admin lui-même ; la base évite un redéploiement pour chaque testeur.
 */
export async function canSeePrivate(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  if (fromEnv(userId)) return true
  try {
    return (await getRepo().users.get(userId))?.tester === true
  } catch {
    // Base indisponible : on ne devine pas, l'IA privée reste privée.
    return false
  }
}

/** Qui entre dans l'espace créateur et le bac à sable : les administrateurs et les créateurs cochés depuis l'admin. */
export async function isCreator(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  if (getAdminIds().has(userId)) return true
  try {
    return (await getRepo().users.get(userId))?.creator === true
  } catch {
    return false
  }
}
