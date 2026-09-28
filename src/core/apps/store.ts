import type { AppDefinition } from '@/apps/types'
import type { KnowledgeChunk } from '@/core/knowledge/search'

/**
 * Magasin mémoire des IA créateurs publiées (deuxième source du registre, après le code).
 * Rempli par `loadCreatorAppsInto` (cœur) et rafraîchi par `ensureAppsLoaded` (serveur).
 * Le registre le lit de façon synchrone : les 25 appels de `getApp` gardent leur signature.
 */
export interface StoredApp {
  app: AppDefinition
  knowledge: KnowledgeChunk[]
}

const stored = new Map<string, StoredApp>()

export function setStoredApps(apps: StoredApp[]): void {
  stored.clear()
  for (const s of apps) stored.set(s.app.slug, s)
}

export function clearStoredApps(): void {
  stored.clear()
}

export function storedApp(slug: string): AppDefinition | undefined {
  return stored.get(slug)?.app
}

export function listStoredApps(): AppDefinition[] {
  return Array.from(stored.values(), (s) => s.app)
}

export function storedKnowledge(slug: string): KnowledgeChunk[] {
  return stored.get(slug)?.knowledge ?? []
}
