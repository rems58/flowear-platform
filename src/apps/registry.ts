import { ADMIN_PUSH_SLUG } from '@/core/admin/constants'
import { addToolProvider } from '@/core/tools'
import { listStoredApps, storedApp } from '@/core/apps/store'
import type { AppDefinition } from './types'
import { amorceApp } from './amorce/manifest'
import { AMORCE_TOOLS } from './amorce/tools'
import { remyApp } from './remy/manifest'

/**
 * Registre des IA, à deux sources : celles du code (un manifeste dans `src/apps/<slug>/` +
 * une ligne ici) et celles des créateurs, publiées en base et chargées dans le magasin
 * (`src/core/apps/store.ts`) par `ensureAppsLoaded()` en tête des points d'entrée.
 * Le code passe toujours devant : un slug du code ne peut pas être masqué par la base.
 * Le cœur (`src/core`) ne connaît aucune IA en particulier.
 */
const apps: ReadonlyMap<string, AppDefinition> = new Map<string, AppDefinition>([
  [remyApp.slug, remyApp],
  [amorceApp.slug, amorceApp],
])

// Outils propres à une IA : déclarés ici, enregistrés par le cœur avec les génériques.
addToolProvider(() => AMORCE_TOOLS)

// Le slug des notifications de l'admin est réservé : une IA qui le porterait ouvrirait
// `/api/v1/<slug>/push` à tout le monde, donc les signalements de l'admin.
if (apps.has(ADMIN_PUSH_SLUG)) throw new Error(`Le slug « ${ADMIN_PUSH_SLUG} » est réservé aux notifications de l'admin`)

export function getApp(slug: string): AppDefinition | undefined {
  return apps.get(slug) ?? storedApp(slug)
}

export function listApps(): AppDefinition[] {
  return [...apps.values(), ...listStoredApps().filter((a) => !apps.has(a.slug))]
}

/** Les IA visibles de tout le monde. Les privées n'apparaissent qu'aux administrateurs. */
export function listPublicApps(): AppDefinition[] {
  return listApps().filter((a) => a.access === 'public')
}

export function isAppSlug(slug: string): boolean {
  return apps.has(slug) || storedApp(slug) !== undefined
}
