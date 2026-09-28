import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { appBrand } from '@/apps/types'
import { FunnelBar, Section, StatCard, Table, VerdictBadge } from '@/components/admin/ui'
import { AppIcon } from '@/components/app-icon'
import { killVerdict } from '@/core/admin/kill'
import { pick } from '@/core/i18n/locale'
import { isSafeSlug } from '@/core/security/sanitize'
import { L, fmt } from '@/lib/admin/labels'
import { lastDays, ratio, sumByDay } from '@/lib/admin/series'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

/**
 * Page d'une IA : les mêmes chiffres que la vue d'ensemble, filtrés, plus ce qui n'a de
 * sens que pour elle. Le verdict kill ou keep est calculé depuis son manifeste : la
 * décision reste à Rémy, mais elle est posée devant lui au lieu d'être repoussée.
 */
export default async function AdminAppPage({ params }: { params: Promise<{ slug: string }> }) {
  await ensureAppsLoaded()
  await requireAdminPage()
  const { slug } = await params
  if (!isSafeSlug(slug)) notFound()
  const app = getApp(slug)
  if (!app) notFound()
  const repo = getRepo()
  const [activity, cohorts, funnel, quality, launchedAt, weekly, creatorApp] = await Promise.all([
    repo.admin.dailyActivity(14, slug),
    repo.admin.cohorts(slug),
    repo.admin.funnel(),
    repo.admin.quality(),
    repo.admin.launchedAt(slug),
    repo.admin.weeklyActive(),
    repo.creatorApps.get(slug),
  ])
  const name = pick(app.name, 'fr')
  const now = new Date()
  const days = lastDays(14, now)
  const byDay = (value: (d: (typeof activity)[number]) => number) => sumByDay(activity, days, value)
  const week = activity.filter((a) => a.day >= days[7])
  const q = quality.find((x) => x.appSlug === slug)
  const f = funnel.find((x) => x.appSlug === slug)
  const eligible = cohorts.filter((c) => c.eligibleD7)
  const verdict = killVerdict(
    app,
    {
      eligible: eligible.reduce((s, c) => s + c.signups, 0),
      retainedD7: eligible.reduce((s, c) => s + c.d7, 0),
      signups: cohorts.reduce((s, c) => s + c.signups, 0),
      launchedAt,
    },
    now
  )
  const latest = activity.filter((a) => a.day === days[days.length - 1])

  return (
    <>
      <div className="mb-1 flex items-center gap-3">
        <AppIcon brand={appBrand(app, 'fr')} size={44} />
        <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
        <VerdictBadge color={verdict.color} />
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        {verdict.reason}
        {creatorApp ? (
          <>
            {' · '}
            <Link href={`/admin/createurs/${slug}`} className="font-medium text-foreground underline-offset-4 hover:underline">{L.creators.revenueAndLink}</Link>
          </>
        ) : null}
      </p>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={L.app.retentionD7} value={fmt.pct(verdict.retentionD7)} sub={`${L.app.target} ${fmt.pct(verdict.targetD7)}`} />
        <StatCard label={L.app.signups} value={fmt.n(verdict.signups)} sub={launchedAt ? `${L.app.launched} ${fmt.date(launchedAt)}` : L.app.notLaunched} />
        <StatCard label={L.overview.people} value={fmt.n(weekly[slug] ?? 0)} sub={L.common.week} spark={byDay((a) => a.activeUsers)} />
        <StatCard label={L.overview.messages} value={fmt.n(week.reduce((s, a) => s + a.messages, 0))} sub={L.common.week} spark={byDay((a) => a.messages)} />
        <StatCard label={L.overview.cost} value={fmt.usd(week.reduce((s, a) => s + a.costUsd, 0))} sub={L.common.week} spark={byDay((a) => a.costUsd)} />
        <StatCard label={L.overview.health} value={fmt.ms(latest[0]?.latencyP50Ms ?? 0)} sub={`${L.quality.p95} ${fmt.ms(latest[0]?.latencyP95Ms ?? 0)}, ${fmt.n(q?.fallbacks ?? 0)} ${L.quality.fallbacks.toLowerCase()}`} />
        <StatCard label={L.overview.quality} value={fmt.pct(q ? ratio(q.thumbsUp, q.thumbsUp + q.thumbsDown) : null)} sub={`${fmt.n(q?.genericAnswers ?? 0)} ${L.quality.generic.toLowerCase()}`} />
        <StatCard label={L.overview.reports} value={fmt.n(q?.openReports ?? 0)} accent={q && q.openReports > 0 ? 'red' : undefined} sub={verdict.reviewDueAt ? `${L.app.reviewDue} ${fmt.date(verdict.reviewDueAt)}` : undefined} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title={L.overview.funnel}>
          {f ? (
            <FunnelBar
              steps={[
                { label: L.funnel.started, value: f.started },
                { label: L.funnel.onboarded, value: f.onboarded },
                { label: L.funnel.firstMessage, value: f.firstMessage },
                { label: L.funnel.threeMessages, value: f.threeMessages },
                { label: L.funnel.subscribed, value: f.subscribed },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{L.cohorts.empty}</p>
          )}
        </Section>
        <Section title={L.overview.cohorts}>
          <Table
            head={[L.cohorts.week, L.cohorts.signups, L.cohorts.d1, L.cohorts.d7, L.cohorts.d30]}
            empty={L.cohorts.empty}
            rows={cohorts.map((c) => [
              fmt.date(c.week),
              fmt.n(c.signups),
              c.eligibleD1 ? fmt.pct(ratio(c.d1, c.signups)) : L.cohorts.tooEarly,
              c.eligibleD7 ? fmt.pct(ratio(c.d7, c.signups)) : L.cohorts.tooEarly,
              c.eligibleD30 ? fmt.pct(ratio(c.d30, c.signups)) : L.cohorts.tooEarly,
            ])}
          />
        </Section>
      </div>

      {/* Les appels et échecs sont comptés pour l'IA entière, pas par outil : les afficher sur
          chaque ligne ferait croire à un détail qu'on n'a pas. */}
      <Section title={L.app.tools} aside={<span className="text-sm text-muted-foreground">{fmt.n(q?.toolCalled ?? 0)} {L.quality.tools.toLowerCase()}, {fmt.n(q?.toolFailed ?? 0)} {L.quality.toolFailed}</span>}>
        <ul className="flex flex-wrap gap-2">
          {app.tools.enabled.map((tool) => (
            <li key={tool} className="rounded-full bg-black/[0.06] px-3 py-1 font-mono text-xs dark:bg-white/[0.1]">
              {tool}
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
