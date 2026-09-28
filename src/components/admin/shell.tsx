import Link from 'next/link'
import { Coins, Handshake, Inbox, LayoutGrid, Lightbulb, Palette, Settings2, Sparkles, SlidersHorizontal, Users } from 'lucide-react'
import { FLOWEAR_INDIGO } from '@/components/category-icon'
import { FlowearLogo } from '@/components/flowear-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { L } from '@/lib/admin/labels'
import { AdminNav } from './nav'

export interface AdminApp {
  slug: string
  name: string
}

/**
 * Coque de l'admin : même grammaire que le hub (colonne de gauche, fond gris doux, icônes
 * monochromes), pour que ce soit chez Flowear et non un tableau de bord rapporté.
 * Un admin n'a pas besoin d'être joli, il a besoin d'être lisible en dix secondes.
 */
export function AdminShell({ apps, reportsNew, children }: { apps: AdminApp[]; reportsNew: number; children: React.ReactNode }) {
  const items = [
    { href: '/admin', label: L.nav.overview, icon: <LayoutGrid className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden />, exact: true },
    { href: '/admin/personnes', label: L.nav.people, icon: <Users className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden /> },
    { href: '/admin/depenses', label: L.nav.spend, icon: <Coins className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden /> },
    { href: '/admin/affilies', label: L.nav.affiliates, icon: <Handshake className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden /> },
    { href: '/admin/createurs', label: L.nav.creators, icon: <Palette className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden /> },
    { href: '/admin/studio', label: L.nav.studio, icon: <Lightbulb className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden /> },
    { href: '/admin/boite', label: L.nav.inbox, icon: <Inbox className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden />, badge: reportsNew },
    { href: '/admin/reglages', label: L.nav.settings, icon: <Settings2 className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden /> },
  ]
  const appItems = [
    { href: '/admin/ia', label: L.nav.compare, icon: <SlidersHorizontal className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden />, exact: true },
    ...apps.map((a) => ({
      href: `/admin/ia/${a.slug}`,
      label: a.name,
      icon: <Sparkles className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden />,
    })),
  ]

  return (
    <div className="flex min-h-dvh w-full">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-black/5 bg-[#f5f5f7] px-3 py-5 md:flex dark:border-white/[0.06] dark:bg-[#161617]">
        <Link href="/" className="flex items-center gap-2.5 px-2 text-lg font-semibold tracking-tight" aria-label={L.nav.backToHub}>
          <FlowearLogo size={26} />
          Flowear
          <span className="ml-auto rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground dark:bg-white/[0.1]">admin</span>
        </Link>
        <AdminNav items={items} className="mt-4" />
        <p className="mt-4 px-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{L.nav.apps}</p>
        <AdminNav items={appItems} className="mt-1" />
        <div className="mt-auto flex items-center justify-between pt-6">
          <ThemeToggle />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3 md:hidden dark:border-white/[0.06]">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <FlowearLogo size={24} />
            Flowear
          </Link>
          <ThemeToggle />
        </header>
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 py-2 md:hidden [scrollbar-width:none]">
          <AdminNav items={[...items, ...appItems]} horizontal />
        </div>
        <main className="min-w-0 px-4 pb-16 pt-4 md:px-8 md:pt-6">{children}</main>
      </div>
    </div>
  )
}
