import { defineApp } from '@/apps/types'
import type { Repo } from '@/core/data/repo'
import { chunkMarkdown } from '@/core/knowledge/search'
import { sanitizeCreatorManifest } from '@/core/studio/manifest'
import { isReservedSlug } from './reserved'
import { setStoredApps, type StoredApp } from './store'

export interface LoadResult {
  loaded: number
  /** Slugs dont le manifeste publié ne passe plus le schéma : ignorés, jamais bloquants. */
  rejected: string[]
}

/**
 * Charge les IA créateurs publiées dans le magasin. Un manifeste invalide en base (schéma
 * durci depuis sa publication, ligne modifiée à la main) est ignoré et journalisé : il ne
 * doit jamais empêcher les autres IA, ni celles du code, de répondre.
 */
export async function loadCreatorAppsInto(repo: Repo): Promise<LoadResult> {
  const rows = await repo.creatorApps.listPublished()
  const apps: StoredApp[] = []
  const rejected: string[] = []
  for (const row of rows) {
    if (!row.publishedManifest || isReservedSlug(row.slug)) {
      rejected.push(row.slug)
      continue
    }
    try {
      const app = defineApp(sanitizeCreatorManifest(row.publishedManifest))
      if (app.slug !== row.slug) throw new Error('slug différent de la ligne')
      const knowledge = (row.publishedKnowledge ?? []).flatMap((f) => chunkMarkdown(f.name, f.markdown))
      apps.push({ app, knowledge })
    } catch (error) {
      console.error(`[apps] IA créateur « ${row.slug} » ignorée :`, error instanceof Error ? error.message : error)
      rejected.push(row.slug)
    }
  }
  setStoredApps(apps)
  return { loaded: apps.length, rejected }
}
