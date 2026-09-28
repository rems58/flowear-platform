import 'server-only'
import type { Repo } from '@/core/data/repo'
import type { CreatorApp } from '@/core/data/types'
import type { Locale } from '@/core/i18n/locale'
import { buildPublicStats, type PublicStats } from '@/core/studio/creator-stats'

/**
 * Rassemble les agrégats d'une IA créateur et construit la vue partagée. Même fonction pour la
 * page publique à jeton et pour l'aperçu de l'admin : ce que Rémy voit est ce que le créateur voit.
 */
export async function loadPublicStats(repo: Repo, app: CreatorApp, locale: Locale, now = new Date()): Promise<PublicStats> {
  const [stats, funnel, cohorts, payments, payouts] = await Promise.all([
    repo.creatorApps.stats(app.slug, now),
    repo.admin.funnel(app.slug),
    repo.admin.cohorts(app.slug),
    repo.events.listPaymentsForApp(app.slug),
    repo.creatorPayouts.list(app.slug),
  ])
  return buildPublicStats({
    app: { slug: app.slug, status: app.status, sharePercent: app.sharePercent, manifest: app.publishedManifest ?? app.manifest },
    stats,
    funnel: funnel.find((f) => f.appSlug === app.slug),
    cohorts,
    payments,
    payouts,
    now,
    locale,
  })
}
