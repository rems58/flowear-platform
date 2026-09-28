import Link from 'next/link'
import { Search } from 'lucide-react'
import { Table } from '@/components/admin/ui'
import { LOCALE_META, isLocale } from '@/core/i18n/locale'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

/** Les personnes, les plus récentes d'abord, filtrées par un bout d'email (`?q=`). */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage()
  const { q } = await searchParams
  const query = q?.trim().slice(0, 80) || null
  const users = await getRepo().users.list(query, 100)

  return (
    <>
      <h1 className="mb-4 text-3xl font-bold tracking-tight">{L.people.title}</h1>
      <form className="relative mb-5 block max-w-md" action="/admin/personnes">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={query ?? ''}
          placeholder={L.people.search}
          aria-label={L.people.search}
          className="h-10 w-full rounded-xl bg-black/[0.05] pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 dark:bg-white/[0.08]"
        />
      </form>
      <Table
        head={[L.people.email, L.people.locale, L.people.createdAt]}
        empty={L.people.empty}
        rows={users.map((u) => [
          <Link key={u.clerkUserId} href={`/admin/personnes/${encodeURIComponent(u.clerkUserId)}`} className="font-medium text-[#5E5CE6] hover:underline">
            {u.email ?? L.people.noEmail}
          </Link>,
          isLocale(u.locale) ? LOCALE_META[u.locale].autonym : u.locale,
          fmt.date(u.createdAt),
        ])}
      />
    </>
  )
}
