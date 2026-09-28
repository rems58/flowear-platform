import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getApp } from '@/apps/registry'
import { CreatorMoneyActions } from '@/components/admin/creator-money-actions'
import { Section, Table } from '@/components/admin/ui'
import { PublicStatsView } from '@/components/studio/public-stats-view'
import { isSafeSlug } from '@/core/security/sanitize'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { getRepo } from '@/lib/db/repo'
import { getMessages } from '@/lib/i18n/messages'
import { loadPublicStats } from '@/lib/studio/public-stats'

/**
 * Une IA de créateur côté admin : l'argent mois par mois, les versements, le lien de
 * statistiques et, en bas, exactement la page que le créateur verra par ce lien.
 */
export default async function CreatorAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdminPage()
  await ensureAppsLoaded()
  const { slug } = await params
  if (!isSafeSlug(slug)) notFound()
  const repo = getRepo()
  const app = await repo.creatorApps.get(slug)
  if (!app) notFound()
  const [data, payouts, owner] = await Promise.all([loadPublicStats(repo, app, 'fr'), repo.creatorPayouts.list(slug), repo.users.get(app.ownerId)])
  const live = Boolean(getApp(slug))

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/createurs" className="underline-offset-4 hover:underline">← {L.creators.back}</Link>
      </p>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">{data.name}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        /{slug} · {L.studio.status[app.status]} · {owner?.email ?? app.ownerId} · {app.sharePercent} %
        {live ? (
          <>
            {' · '}
            <Link href={`/admin/ia/${slug}`} className="underline-offset-4 hover:underline">{L.creators.fullStats}</Link>
          </>
        ) : null}
        {' · '}
        <Link href={`/admin/studio/revue/${slug}`} className="underline-offset-4 hover:underline">{L.creators.review}</Link>
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <Section title={L.creators.money}>
            <Table
              head={[L.creators.colMonth, L.creators.colPaying, L.creators.gross, L.creators.colNet, L.creators.share, L.creators.colDue, L.creators.pending]}
              empty={L.creators.noPayments}
              rows={data.money.months.map((m) => [m.month, fmt.n(m.payingUsers), fmt.eur(m.grossEur), fmt.eur(m.netEur), fmt.eur(m.shareEur), fmt.eur(m.dueEur), fmt.eur(m.pendingEur)])}
            />
            <p className="mt-2 text-sm font-medium">
              {L.creators.summary({
                shareEur: fmt.eur(data.money.totals.shareEur),
                dueEur: fmt.eur(data.money.totals.dueEur),
                paidEur: fmt.eur(data.money.totals.paidEur),
                balanceEur: fmt.eur(data.money.totals.balanceEur),
                pendingEur: fmt.eur(data.money.totals.pendingEur),
                advanceEur: data.money.totals.advanceEur > 0 ? fmt.eur(data.money.totals.advanceEur) : null,
              })}
            </p>
          </Section>
          <Section title={L.creators.payouts}>
            <Table head={[L.creators.colDate, L.creators.colAmount, L.creators.colNote]} empty={L.creators.payoutsEmpty} rows={payouts.map((p) => [p.paidAt, fmt.eur(p.amountCents / 100), p.note ?? ''])} />
          </Section>
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <CreatorMoneyActions slug={slug} shareLinkAt={app.shareLinkAt} />
        </aside>
      </div>

      <Section title={L.creators.preview}>
        <div className="rounded-3xl border-2 border-dashed border-black/[0.12] p-6 dark:border-white/[0.14]">
          <PublicStatsView data={data} t={getMessages('fr').stats} locale="fr" />
        </div>
      </Section>
    </>
  )
}
