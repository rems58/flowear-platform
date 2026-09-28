import Link from 'next/link'
import { Section, StatCard, Table } from '@/components/admin/ui'
import { pick } from '@/core/i18n/locale'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

/** La file de revue : soumises d'abord, puis en ligne et suspendues, pour agir dessus. */
export default async function StudioReviewPage() {
  await requireAdminPage()
  const repo = getRepo()
  const [queue, live] = await Promise.all([repo.creatorApps.listByStatus(['submitted', 'in_review', 'changes_requested']), repo.creatorApps.listByStatus(['published', 'suspended'])])
  const row = (a: (typeof queue)[number]) => [
    <Link key="s" href={`/admin/studio/revue/${a.slug}`} className="font-medium underline-offset-4 hover:underline">{pick(a.manifest.name, 'fr') || a.slug}</Link>,
    <span key="u" className="font-mono text-xs">/{a.slug}</span>,
    L.studio.status[a.status],
    String(a.version),
    <Link key="o" href={`/admin/personnes/${encodeURIComponent(a.ownerId)}`} className="underline-offset-4 hover:underline">{L.studio.account}</Link>,
    a.submittedAt ? fmt.dateTime(a.submittedAt) : '',
  ]
  const head = [L.studio.nameCol, L.studio.slugCol, L.studio.statusCol, L.studio.version, L.studio.owner, L.studio.submittedAt]
  return (
    <>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">{L.studio.review}</h1>
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">{L.studio.reviewIntro}</p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <StatCard label={L.studio.pending} value={fmt.n(queue.length)} />
        <StatCard label={L.studio.live} value={fmt.n(live.filter((a) => a.status === 'published').length)} />
      </div>
      <Section title={L.studio.pending}>
        <Table head={head} empty={L.studio.emptyQueue} rows={queue.map(row)} />
      </Section>
      <Section title={L.studio.live}>
        <Table head={head} empty={L.studio.emptyQueue} rows={live.map(row)} />
      </Section>
    </>
  )
}
