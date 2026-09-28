import Link from 'next/link'
import { listApps } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { ReportActions } from '@/components/admin/report-actions'
import { Section, SeverityBadge } from '@/components/admin/ui'
import { PushToggle } from '@/components/pwa/push-toggle'
import { ADMIN_PUSH_SLUG } from '@/core/admin/constants'
import { pick } from '@/core/i18n/locale'
import { REPORT_STATUSES, type ReportStatus } from '@/core/reports/schema'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

/**
 * Boîte : tout ce qui réclame quelqu'un. Les plus graves en tête, puis les plus récents.
 * `?s=<id>` (depuis une notification) met le signalement visé en évidence.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ statut?: string; s?: string }> }) {
  await ensureAppsLoaded()
  const userId = await requireAdminPage()
  const sp = await searchParams
  const status = (REPORT_STATUSES as readonly string[]).includes(sp.statut ?? '') ? (sp.statut as ReportStatus) : null
  const repo = getRepo()
  const [reports, devices] = await Promise.all([repo.reports.list({ status, limit: 100 }), repo.push.countForApp(userId, ADMIN_PUSH_SLUG)])
  const names = new Map(listApps().map((a) => [a.slug, pick(a.name, 'fr')]))

  const filters: { key: string | null; label: string }[] = [
    { key: null, label: L.inbox.all },
    { key: 'new', label: L.inbox.new },
    { key: 'seen', label: L.inbox.seen },
    { key: 'resolved', label: L.inbox.resolved },
  ]

  return (
    <>
      <h1 className="mb-4 text-3xl font-bold tracking-tight">{L.inbox.title}</h1>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={f.key ? `/admin/boite?statut=${f.key}` : '/admin/boite'}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${status === f.key ? 'bg-foreground text-background' : 'bg-black/[0.06] hover:bg-black/[0.1] dark:bg-white/[0.1] dark:hover:bg-white/[0.16]'}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/[0.1] px-4 py-10 text-center text-sm text-muted-foreground dark:border-white/[0.12]">{L.inbox.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li key={r.id} id={r.id} className={`rounded-2xl border bg-card p-4 ${sp.s === r.id ? 'border-[#5E5CE6]' : 'border-black/[0.06] dark:border-white/[0.08]'}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <SeverityBadge severity={r.severity} />
                <span className="font-semibold">{L.inbox.category[r.category] ?? r.category}</span>
                {r.rating ? (
                  <span className="text-amber-500" aria-label={`${r.rating}/5`}>
                    {'★'.repeat(r.rating)}
                    <span className="text-muted-foreground/40">{'★'.repeat(5 - r.rating)}</span>
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  {L.inbox.source[r.source]}
                  {r.appSlug ? ` · ${names.get(r.appSlug) ?? r.appSlug}` : ''}
                  {` · ${fmt.dateTime(r.createdAt)}`}
                </span>
                <span className="ml-auto rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:bg-white/[0.1]">{L.inbox.status[r.status]}</span>
              </div>
              {r.body ? <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p> : null}
              {r.resolution ? <p className="mt-2 text-sm text-muted-foreground">↳ {r.resolution}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {r.userId ? (
                  <Link href={`/admin/personnes/${encodeURIComponent(r.userId)}`} className="text-sm font-medium text-[#5E5CE6] hover:underline">
                    {L.inbox.openPerson}
                  </Link>
                ) : null}
                {r.userId && r.conversationId ? (
                  <Link href={`/admin/personnes/${encodeURIComponent(r.userId)}/conversations/${r.conversationId}`} className="text-sm font-medium text-[#5E5CE6] hover:underline">
                    {L.inbox.openConversation}
                  </Link>
                ) : null}
                <div className="ml-auto">
                  <ReportActions id={r.id} status={r.status} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10">
        <Section title={L.inbox.push.title}>
          <p className="mb-2 text-sm text-muted-foreground">{L.inbox.push.hint}</p>
          <PushToggle appSlug={ADMIN_PUSH_SLUG} appName="Flowear admin" locale="fr" initialEnabled={devices > 0} endpoint="/api/admin/push" />
        </Section>
      </div>
    </>
  )
}
