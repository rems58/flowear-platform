import Link from 'next/link'
import { Section, StatCard, Table } from '@/components/admin/ui'
import { pick, type LocalizedText } from '@/core/i18n/locale'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { creatorRow } from '@/lib/admin/creators'
import { getRepo } from '@/lib/db/repo'

/** Toutes les IA des créateurs, avec leurs chiffres et ce que Flowear leur doit. */
export default async function CreatorsAdminPage() {
  await requireAdminPage()
  const repo = getRepo()
  const now = new Date()
  const apps = await repo.creatorApps.listAll()
  const rows = await Promise.all(apps.map((a) => creatorRow(repo, a, now)))
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0)

  return (
    <>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">{L.creators.title}</h1>
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">{L.creators.intro}</p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={L.creators.live} value={fmt.n(rows.filter((r) => r.app.publishedManifest && r.app.status !== 'suspended').length)} />
        <StatCard label={L.creators.grossMonth} value={fmt.eur(sum((r) => r.thisMonthGross))} />
        <StatCard label={L.creators.balance} value={fmt.eur(sum((r) => r.money.totals.balanceEur))} accent={sum((r) => r.money.totals.balanceEur) > 0 ? 'red' : undefined} />
        <StatCard label={L.creators.pending} value={fmt.eur(sum((r) => r.money.totals.pendingEur))} />
      </div>
      <Section title={L.creators.title}>
        <Table
          head={[L.creators.app, L.creators.owner, L.creators.status, L.creators.people, L.creators.active7, L.creators.subscribers, L.creators.gross, L.creators.share, L.creators.balance]}
          empty={L.creators.empty}
          rows={rows.map((r) => [
            <Link key="n" href={`/admin/createurs/${r.app.slug}`} className="font-medium underline-offset-4 hover:underline">{pick(r.app.manifest.name as LocalizedText, 'fr') || r.app.slug}</Link>,
            r.ownerEmail ?? '',
            L.studio.status[r.app.status],
            fmt.n(r.stats.onboarded),
            fmt.n(r.stats.active7d),
            fmt.n(r.subscribers),
            fmt.eur(r.money.totals.grossEur),
            fmt.eur(r.money.totals.shareEur),
            <span key="b" className={r.money.totals.balanceEur > 0 ? 'font-semibold' : ''}>{fmt.eur(r.money.totals.balanceEur)}</span>,
          ])}
        />
      </Section>
    </>
  )
}
