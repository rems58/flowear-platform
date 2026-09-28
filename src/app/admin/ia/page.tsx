import Link from 'next/link'
import { listApps } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { appBrand } from '@/apps/types'
import { Table, VerdictBadge } from '@/components/admin/ui'
import { AppIcon } from '@/components/app-icon'
import { killVerdict } from '@/core/admin/kill'
import { pick } from '@/core/i18n/locale'
import { requireAdminPage } from '@/lib/admin/access'
import { L, fmt } from '@/lib/admin/labels'
import { lastDays, ratio } from '@/lib/admin/series'
import { getRepo } from '@/lib/db/repo'

/**
 * Toutes les IA côte à côte, mêmes colonnes. C'est le tableau qui répond à la promesse de
 * la base : laquelle retient, laquelle coûte, laquelle paie.
 */
export default async function CompareAppsPage() {
  await ensureAppsLoaded()
  await requireAdminPage()
  const repo = getRepo()
  const now = new Date()
  const week = lastDays(7, now)
  const [activity, quality, funnel, paid, weekly] = await Promise.all([repo.admin.dailyActivity(7), repo.admin.quality(), repo.admin.funnel(), repo.admin.paidSubscriptions(), repo.admin.weeklyActive()])
  const rows = await Promise.all(
    listApps().map(async (app) => {
      const [cohorts, launchedAt] = await Promise.all([repo.admin.cohorts(app.slug), repo.admin.launchedAt(app.slug)])
      const eligible = cohorts.filter((c) => c.eligibleD7)
      const verdict = killVerdict(
        app,
        { eligible: eligible.reduce((s, c) => s + c.signups, 0), retainedD7: eligible.reduce((s, c) => s + c.d7, 0), signups: cohorts.reduce((s, c) => s + c.signups, 0), launchedAt },
        now
      )
      const mine = activity.filter((a) => a.appSlug === app.slug && week.includes(a.day))
      const q = quality.find((x) => x.appSlug === app.slug)
      const f = funnel.find((x) => x.appSlug === app.slug)
      return {
        app,
        name: pick(app.name, 'fr'),
        people: f?.onboarded ?? 0,
        active7: weekly[app.slug] ?? 0,
        messages7: mine.reduce((s, a) => s + a.messages, 0),
        cost7: mine.reduce((s, a) => s + a.costUsd, 0),
        retention: verdict.retentionD7,
        thumbs: q ? ratio(q.thumbsUp, q.thumbsUp + q.thumbsDown) : null,
        subscribers: new Set(paid.filter((p) => p.appSlug === app.slug).map((p) => p.userId)).size,
        verdict,
      }
    })
  )

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">{L.compare.title}</h1>
      <Table
        head={[L.compare.app, L.compare.people, L.compare.active7, L.compare.messages7, L.compare.cost7, L.compare.retention, L.compare.thumbs, L.compare.subscribers, L.compare.verdict]}
        empty={L.compare.empty}
        rows={rows.map((r) => [
          <Link key={r.app.slug} href={`/admin/ia/${r.app.slug}`} className="flex items-center gap-2 font-medium hover:underline">
            <AppIcon brand={appBrand(r.app, 'fr')} size={24} />
            {r.name}
          </Link>,
          fmt.n(r.people),
          fmt.n(r.active7),
          fmt.n(r.messages7),
          fmt.usd(r.cost7),
          fmt.pct(r.retention),
          fmt.pct(r.thumbs),
          fmt.n(r.subscribers),
          <VerdictBadge key={`${r.app.slug}-v`} color={r.verdict.color} />,
        ])}
      />
    </>
  )
}
