import { listApps } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { FunnelBar, Section, StatCard, Table } from '@/components/admin/ui'
import { computeRevenue } from '@/core/admin/revenue'
import { pick } from '@/core/i18n/locale'
import { L, fmt } from '@/lib/admin/labels'
import { lastDays, ratio, sumByDay } from '@/lib/admin/series'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

/**
 * Vue d'ensemble : l'écran du lundi matin. Une question par carte, et les trois tableaux
 * qui répondent aux questions des phases : les gens reviennent-ils (cohortes), où est-ce
 * que ça fuit (entonnoir), et que disent-ils de la qualité.
 */
export default async function AdminOverviewPage() {
  await ensureAppsLoaded()
  // Vérifié page par page, pas seulement dans la mise en page : Next peut rendre un segment
  // de page seul, sans repasser par la mise en page, sur une navigation partielle.
  await requireAdminPage()
  const repo = getRepo()
  const [overview, activity, cohorts, funnel, quality, paid, conversion, churn, attribution, visits, welcome, freeDays] = await Promise.all([
    repo.admin.overview(),
    repo.admin.dailyActivity(14),
    repo.admin.cohorts(),
    repo.admin.funnel(),
    repo.admin.quality(),
    repo.admin.paidSubscriptions(),
    repo.admin.trialConversion(),
    repo.admin.churnMonth(),
    repo.admin.attribution(),
    repo.admin.dailyVisits(14),
    repo.admin.welcomeConversion(),
    repo.admin.freeTierDays(),
  ])
  const revenue = computeRevenue(paid)
  // Coût IA moyen par abonné sur le mois, en dollars : la marge est un ordre de grandeur,
  // pas une écriture comptable, les deux devises ne sont pas converties.
  const costPerSubscriber = revenue.subscribers ? overview.costMonthUsd / revenue.subscribers : 0
  // Règle du 18 septembre 2026 : si le coût IA du mois dépasse 30 % du revenu, on serre les
  // plafonds du gratuit ou la durée de la semaine d'accueil (réglages `app_settings`, à chaud).
  // Les devises ne sont pas converties : un ordre de grandeur, pas une écriture comptable.
  const costRatio = revenue.mrr > 0 ? overview.costMonthUsd / revenue.mrr : null
  const names = new Map(listApps().map((a) => [a.slug, pick(a.name, 'fr')]))
  const name = (slug: string) => names.get(slug) ?? slug

  const days = lastDays(14, new Date())
  const sparkActive = sumByDay(activity, days, (a) => a.activeUsers)
  const sparkMessages = sumByDay(activity, days, (a) => a.messages)
  const sparkCost = sumByDay(activity, days, (a) => a.costUsd)
  const sparkVisits = days.map((day) => visits.find((v) => v.day === day)?.visitors ?? 0)
  // Le gratuit : actifs jamais payés, ce qu'ils coûtent, combien butent sur la limite du jour.
  const freeByDay = (v: (d: (typeof freeDays)[number]) => number) => days.map((day) => {
    const row = freeDays.find((d) => d.day === day)
    return row ? v(row) : 0
  })
  const sparkFree = freeByDay((d) => d.activeFree)
  const sparkFreeCost = freeByDay((d) => d.costFreeUsd)
  const freeToday = freeDays.at(-1)
  const freeCost14d = freeDays.reduce((s, d) => s + d.costFreeUsd, 0)
  const freeVideos14d = freeDays.reduce((s, d) => s + d.videosGranted, 0)

  const total = funnel.find((f) => f.appSlug === 'flowear')
  const latest = activity.filter((a) => a.day === days[days.length - 1])
  const p50 = latest.length ? Math.max(...latest.map((a) => a.latencyP50Ms)) : 0
  const p95 = latest.length ? Math.max(...latest.map((a) => a.latencyP95Ms)) : 0

  return (
    <>
      <h1 className="mb-4 text-3xl font-bold tracking-tight">{L.overview.title}</h1>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={L.overview.people} value={fmt.n(overview.usersTotal)} sub={`${fmt.n(overview.activeToday)} ${L.overview.activeToday}, ${fmt.n(overview.activeWeek)} ${L.overview.activeWeek}, ${fmt.n(overview.activeMonth)} ${L.overview.activeMonth}`} spark={sparkActive} />
        <StatCard label={L.overview.signups} value={fmt.n(overview.signupsWeek)} sub={`${fmt.n(overview.signupsToday)} ${L.common.today}, ${fmt.n(overview.signupsMonth)} ${L.overview.activeMonth}`} />
        <StatCard label={L.overview.messages} value={fmt.n(overview.messagesWeek)} sub={`${fmt.n(overview.messagesToday)} ${L.common.today}`} spark={sparkMessages} />
        <StatCard label={L.overview.cost} value={fmt.usd(overview.costMonthUsd)} sub={`${fmt.usd(overview.costTodayUsd)} ${L.common.today}`} spark={sparkCost} />
        <StatCard label={L.overview.subscribers} value={fmt.n(overview.subscribers)} sub={`${fmt.n(overview.inTrial)} ${L.overview.inTrial}`} />
        <StatCard label={L.overview.health} value={fmt.ms(p50)} sub={`${L.quality.p95} ${fmt.ms(p95)}, ${fmt.n(quality.reduce((s, q) => s + q.fallbacks, 0))} ${L.quality.fallbacks.toLowerCase()}`} />
        <StatCard label={L.overview.quality} value={fmt.pct(ratio(quality.reduce((s, q) => s + q.thumbsUp, 0), quality.reduce((s, q) => s + q.thumbsUp + q.thumbsDown, 0)))} sub={`${fmt.n(quality.reduce((s, q) => s + q.genericAnswers, 0))} ${L.quality.generic.toLowerCase()}`} />
        <StatCard label={L.overview.reports} value={fmt.n(overview.reportsNew)} accent={overview.reportsNew > 0 ? 'red' : undefined} />
      </div>

      <Section title={L.overview.freeTier}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={L.overview.welcomeConversion} value={fmt.pct(ratio(welcome.convertedInWindow, welcome.signups30d))} sub={`${fmt.n(welcome.convertedInWindow)} / ${fmt.n(welcome.signups30d)} ${L.overview.welcomeConversionSub}, ${fmt.n(welcome.offerUsed)} ${L.overview.offerUsed}`} />
          <StatCard label={L.overview.lateConversion} value={fmt.pct(ratio(welcome.convertedAny - welcome.convertedInWindow, welcome.signups30d))} sub={L.overview.lateConversionSub} />
          <StatCard label={L.overview.activeFree} value={fmt.n(freeToday?.activeFree ?? 0)} sub={`${fmt.n(freeToday?.limitHitUsers ?? 0)} ${L.overview.limitHit}`} spark={sparkFree} />
          <StatCard label={L.overview.freeCost} value={fmt.usd(freeCost14d)} sub={`${L.overview.freeCostSub}${freeVideos14d ? `, ${fmt.n(freeVideos14d)} ${L.overview.videos}` : ''}`} spark={sparkFreeCost} />
        </div>
      </Section>

      <Section title={L.overview.revenue}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={L.overview.mrr} value={fmt.eur(revenue.mrr)} sub={`${fmt.eur(revenue.arpu)} ${L.overview.arpu}${revenue.bundleShare !== null ? `, ${fmt.pct(revenue.bundleShare)} ${L.overview.bundleShare}` : ''}`} />
          <StatCard label={L.overview.conversion} value={fmt.pct(ratio(conversion.converted, conversion.trialsEnded))} sub={`${fmt.n(conversion.trialsEnded)} ${L.overview.conversionSub}`} />
          <StatCard label={L.overview.churn} value={fmt.pct(ratio(churn.churned, churn.atMonthStart))} sub={`${fmt.n(churn.atMonthStart)} ${L.overview.churnSub}`} />
          <StatCard label={L.overview.margin} value={revenue.subscribers ? `${fmt.eur(revenue.arpu)} − ${fmt.usd(costPerSubscriber)}` : 'n/d'} sub={L.overview.marginSub} />
          <StatCard label={L.overview.costRatio} value={costRatio === null ? 'n/d' : fmt.pct(costRatio)} sub={costRatio !== null && costRatio > 0.3 ? L.overview.costRatioAlert : L.overview.costRatioSub} accent={costRatio !== null && costRatio > 0.3 ? 'red' : undefined} />
        </div>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title={L.overview.visits}>
          <StatCard label={L.common.week} value={fmt.n(visits.filter((v) => days.slice(7).includes(v.day)).reduce((s, v) => s + v.visitors, 0))} sub={L.overview.visitors} spark={sparkVisits} />
        </Section>
        <Section title={L.overview.attribution}>
          <Table
            head={[L.attribution.source, L.attribution.campaign, L.attribution.onboardings]}
            empty={L.attribution.empty}
            rows={attribution.map((a) => [a.source === 'direct' ? L.attribution.direct : a.source, a.campaign || '·', fmt.n(a.onboardings)])}
          />
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title={L.overview.funnel}>
          {total ? (
            <FunnelBar
              steps={[
                { label: L.funnel.started, value: total.started },
                { label: L.funnel.onboarded, value: total.onboarded },
                { label: L.funnel.firstMessage, value: total.firstMessage },
                { label: L.funnel.threeMessages, value: total.threeMessages },
                { label: L.funnel.subscribed, value: total.subscribed },
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

      <Section title={L.overview.quality}>
        <Table
          head={[L.quality.app, L.quality.answers, L.quality.thumbs, L.quality.generic, L.quality.tools, L.quality.fallbacks, L.quality.quotaHits, L.quality.openReports]}
          empty={L.cohorts.empty}
          rows={quality.map((q) => [
            name(q.appSlug),
            fmt.n(q.answers),
            `${fmt.n(q.thumbsUp)} / ${fmt.n(q.thumbsDown)}`,
            fmt.pct(ratio(q.genericAnswers, q.answers)),
            `${fmt.n(q.toolCalled)} (${fmt.n(q.toolFailed)} ${L.quality.toolFailed})`,
            fmt.n(q.fallbacks),
            fmt.n(q.quotaHits),
            fmt.n(q.openReports),
          ])}
        />
      </Section>
    </>
  )
}
