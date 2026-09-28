import { AffiliateForm } from '@/components/admin/affiliate-form'
import { Section, StatCard, Table } from '@/components/admin/ui'
import { computeAffiliateStats, PAYOUT_DELAY_DAYS } from '@/core/growth/affiliates'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

const SITE = 'https://flowear.app'

/**
 * Affiliés : un créateur = un code = un lien. Inscriptions, payants, et ce qui est dû après le
 * délai de rétractation. Le paiement se fait à la main (virement mensuel) ; cette page dit combien.
 */
export default async function AffiliatesPage() {
  await requireAdminPage()
  const repo = getRepo()
  const [affiliates, onboardings] = await Promise.all([repo.affiliates.list(), repo.events.listRefOnboardings()])
  const userIds = [...new Set(onboardings.map((o) => o.userId))]
  const [paidAt, payments] = await Promise.all([repo.events.firstPaidAt(userIds), repo.events.listPayments(userIds)])
  const rows = computeAffiliateStats({
    affiliates,
    onboardings,
    subscriptions: [...paidAt.entries()].map(([userId, firstPaidAt]) => ({ userId, firstPaidAt })),
    payments,
    now: new Date(),
  })
  const totals = rows.reduce((t, r) => ({ signups: t.signups + r.signups, paying: t.paying + r.paying, due: t.due + r.dueEur, pending: t.pending + r.pendingEur }), { signups: 0, paying: 0, due: 0, pending: 0 })
  const unknown = onboardings.filter((o) => !affiliates.some((a) => a.code === o.ref)).length

  return (
    <>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">{L.affiliates.title}</h1>
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">{L.affiliates.intro(PAYOUT_DELAY_DAYS)}</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={L.affiliates.signups} value={fmt.n(totals.signups)} sub={unknown ? L.affiliates.unknownRefs(unknown) : undefined} />
        <StatCard label={L.affiliates.paying} value={fmt.n(totals.paying)} sub={fmt.pct(totals.signups ? totals.paying / totals.signups : null)} />
        <StatCard label={L.affiliates.due} value={fmt.eur(totals.due)} sub={`${L.affiliates.pending} ${fmt.eur(totals.pending)}`} />
      </div>

      <div className="mb-6">
        <AffiliateForm />
      </div>

      <Section title={L.affiliates.table}>
        <Table
          head={[L.affiliates.name, L.affiliates.contact, L.affiliates.link, L.affiliates.appSlug, L.affiliates.signups, L.affiliates.paying, L.affiliates.terms, L.affiliates.revenue, L.affiliates.pending, L.affiliates.due]}
          empty={L.affiliates.empty}
          rows={rows.map((r) => [
            <span key="n" className="font-medium">{r.name}</span>,
            r.contact ?? '',
            <code key="l" className="text-xs">{`${SITE}/${r.appSlug ?? 'amorce'}?ref=${r.code}`}</code>,
            <span key="a" className="font-mono text-xs">{r.appSlug ?? ''}</span>,
            fmt.n(r.signups),
            fmt.n(r.paying),
            r.percent === null ? L.affiliates.fixedTerms(fmt.eur(r.payoutEur)) : L.affiliates.percentTerms(r.percent, r.months),
            r.percent === null ? '' : fmt.eur(r.revenueEur),
            fmt.eur(r.pendingEur),
            <span key="d" className={r.dueEur > 0 ? 'font-semibold' : ''}>{fmt.eur(r.dueEur)}</span>,
          ])}
        />
      </Section>
    </>
  )
}
