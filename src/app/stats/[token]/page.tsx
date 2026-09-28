import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { PublicStatsView } from '@/components/studio/public-stats-view'
import { hashShareToken, isShareTokenFormat } from '@/core/studio/share-token'
import { getRepo } from '@/lib/db/repo'
import { getI18n } from '@/lib/i18n/server'
import { loadPublicStats } from '@/lib/studio/public-stats'

// Jamais mise en cache, jamais indexée, jamais de référent transmis : le jeton est dans l'URL.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Flowear', robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' }

/**
 * Statistiques d'une IA créateur, par lien secret. Une seule page, en lecture seule, sans compte :
 * le jeton (256 bits) est comparé par empreinte, un jeton mal formé ou inconnu répond 404 sans
 * rien dire de plus. La page n'affiche que la vue partagée (`PublicStats`), construite à partir
 * d'agrégats ; aucune navigation vers le reste de Flowear, aucune action possible.
 */
export default async function SharedStatsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isShareTokenFormat(token)) notFound()
  const repo = getRepo()
  const app = await repo.creatorApps.getByShareTokenHash(await hashShareToken(token))
  if (!app) notFound()
  const { userId } = await auth()
  const { locale, t } = await getI18n(userId)
  const data = await loadPublicStats(repo, app, locale)
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <PublicStatsView data={data} t={t.stats} locale={locale} />
      </div>
    </main>
  )
}
