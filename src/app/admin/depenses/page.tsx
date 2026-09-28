import Link from 'next/link'
import { listApps } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { Section, StatCard, Table } from '@/components/admin/ui'
import { pick } from '@/core/i18n/locale'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

type Props = { searchParams: Promise<{ ia?: string; tri?: string }> }

/** Plafond mensuel d'un abonné (09-business.md § 4 bis) : au-dessus, la ligne passe en rouge. */
const PAID_CAP_USD = 3.5

/**
 * Dépense IA par personne : qui coûte le plus, le moins, la moyenne, par IA et par plan, sur
 * 30 jours et aujourd'hui. Un clic mène à la fiche de la personne. Les chiffres viennent de la
 * vue `people_spend` ; la règle des 50 % (09-business.md) se lit ici, personne par personne.
 */
export default async function SpendPage({ searchParams }: Props) {
  await ensureAppsLoaded()
  await requireAdminPage()
  const sp = await searchParams
  const apps = listApps()
  const ia = apps.some((a) => a.slug === sp.ia) ? (sp.ia as string) : null
  const order = sp.tri === 'asc' ? 'asc' : 'desc'
  const rows = await getRepo().admin.peopleSpend(ia, order, 200)
  const names = new Map(apps.map((a) => [a.slug, pick(a.name, 'fr')]))

  const costs = rows.map((r) => r.cost30dUsd)
  const total = costs.reduce((s, c) => s + c, 0)
  const avg = rows.length ? total / rows.length : 0
  const max = rows.length ? Math.max(...costs) : 0
  const min = rows.length ? Math.min(...costs) : 0
  const free = rows.filter((r) => r.plan === 'free')
  const paying = rows.filter((r) => r.plan !== 'free')
  const avgOf = (list: typeof rows) => (list.length ? fmt.usd(list.reduce((s, r) => s + r.cost30dUsd, 0) / list.length) : 'n/d')

  const link = (params: Record<string, string | null>) => {
    const q = new URLSearchParams()
    const merged = { ia, tri: order, ...params }
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v)
    const s = q.toString()
    return `/admin/depenses${s ? `?${s}` : ''}`
  }
  const chip = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-foreground text-background' : 'bg-black/[0.06] hover:bg-black/[0.1] dark:bg-white/[0.1] dark:hover:bg-white/[0.16]'}`

  return (
    <>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">{L.spend.title}</h1>
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">{L.spend.intro}</p>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={link({ ia: null })} className={chip(ia === null)}>
          {L.spend.allApps}
        </Link>
        {apps.map((a) => (
          <Link key={a.slug} href={link({ ia: a.slug })} className={chip(ia === a.slug)}>
            {names.get(a.slug)}
          </Link>
        ))}
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href={link({ tri: 'desc' })} className={chip(order === 'desc')}>
          {L.spend.mostFirst}
        </Link>
        <Link href={link({ tri: 'asc' })} className={chip(order === 'asc')}>
          {L.spend.leastFirst}
        </Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={L.spend.people} value={fmt.n(rows.length)} sub={`${fmt.n(free.length)} ${L.spend.free}, ${fmt.n(paying.length)} ${L.spend.paid}`} />
        <StatCard label={L.spend.average} value={fmt.usd(avg)} sub={`${L.spend.free} ${avgOf(free)}, ${L.spend.paid} ${avgOf(paying)}`} />
        <StatCard label={L.spend.max} value={fmt.usd(max)} sub={`${L.spend.min} ${fmt.usd(min)}`} accent={max > PAID_CAP_USD ? 'red' : undefined} />
        <StatCard label={L.spend.total} value={fmt.usd(total)} sub={L.spend.totalSub} />
      </div>

      <Section title={L.spend.table}>
        <Table
          head={[L.people.email, L.quality.app, L.people.plan, L.spend.messages, L.spend.today, L.spend.days30, L.spend.perDay, L.people.lastSeen]}
          empty={L.spend.empty}
          rows={rows.map((r) => [
            <Link key={`${r.userId}-${r.appSlug}`} href={`/admin/personnes/${encodeURIComponent(r.userId)}`} className="font-medium text-[#5E5CE6] hover:underline">
              {r.email ?? L.people.noEmail}
            </Link>,
            names.get(r.appSlug) ?? r.appSlug,
            L.spend.plans[r.plan],
            fmt.n(r.messages30d),
            fmt.usd(r.costTodayUsd),
            <span key="c" className={r.cost30dUsd > PAID_CAP_USD ? 'font-semibold text-red-500' : ''}>
              {fmt.usd(r.cost30dUsd)}
            </span>,
            fmt.usd(r.cost30dUsd / 30),
            r.lastMessageAt ? fmt.dateTime(r.lastMessageAt) : L.people.never,
          ])}
        />
      </Section>
    </>
  )
}
