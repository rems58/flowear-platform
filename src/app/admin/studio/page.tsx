import Link from 'next/link'
import { Section, StatCard, Table } from '@/components/admin/ui'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

/** Inscrits des `days` derniers jours ; calculé hors rendu pour rester pur. */
function countSince(rows: { createdAt: string }[], days: number): number {
  const since = new Date().getTime() - days * 86_400_000
  return rows.filter((r) => new Date(r.createdAt).getTime() >= since).length
}

/** Liste d'attente de Flowear Studio : qui s'est inscrit, avec quelle idée, depuis où. */
export default async function StudioAdminPage() {
  await requireAdminPage()
  const repo = getRepo()
  const [rows, total, queue] = await Promise.all([repo.studioWaitlist.list(500), repo.studioWaitlist.count(), repo.creatorApps.listByStatus(['submitted', 'in_review'])])
  const week = countSince(rows, 7)
  // Qui, parmi les inscrits, a déjà un compte : le rôle créateur se donne depuis sa fiche.
  const found = await Promise.all(rows.map((r) => repo.users.getByEmail(r.email).catch(() => null)))
  const accounts = new Map<string, string>()
  rows.forEach((r, i) => {
    const u = found[i]
    if (u) accounts.set(r.email, u.clerkUserId)
  })

  return (
    <>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">{L.studio.title}</h1>
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">{L.studio.intro}</p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <StatCard label={L.studio.total} value={fmt.n(total)} sub={`${fmt.n(week)} ${L.studio.week}`} />
        <Link href="/admin/studio/revue" className="block"><StatCard label={L.studio.pending} value={fmt.n(queue.length)} sub={L.studio.review} /></Link>
      </div>
      <Section title={L.studio.title}>
        <Table
          head={[L.people.email, L.studio.idea, L.studio.audience, L.common.language, L.studio.origin, L.common.date, L.studio.account]}
          empty={L.studio.empty}
          rows={rows.map((r) => [
            <a key="e" href={`mailto:${r.email}`} className="font-medium underline-offset-4 hover:underline">{r.email}</a>,
            r.idea,
            r.audience ?? '',
            r.locale,
            r.utm ? [r.utm.source, r.utm.campaign].filter(Boolean).join(' / ') : '',
            fmt.dateTime(r.createdAt),
            accounts.has(r.email) ? <Link key="a" href={`/admin/personnes/${encodeURIComponent(accounts.get(r.email)!)}`} className="underline-offset-4 hover:underline">{L.studio.account}</Link> : <span key="a" className="text-muted-foreground">{L.studio.noAccount}</span>,
          ])}
        />
      </Section>
    </>
  )
}
