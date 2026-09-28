'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { LayoutGrid, Search } from 'lucide-react'
import type { CategoryId } from '@/apps/types'
import { AppIcon } from '@/components/app-icon'
import { CategoryIcon, FLOWEAR_INDIGO } from '@/components/category-icon'
import { UpgradeCard } from '@/components/billing/upgrade-card'
import { FlowearLogo } from '@/components/flowear-logo'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { useI18n } from '@/lib/i18n/provider'

export interface HubApp {
  slug: string
  name: string
  tagline: string
  category: CategoryId
  access: 'public' | 'private'
  brand: { from: string; to: string; glyph: string; mark?: string }
  /** Annoncée, pas encore disponible : carte « Bientôt » sans lien. */
  soon?: boolean
}

interface HubProps {
  apps: HubApp[]
  upcoming: HubApp[]
  signedIn: boolean
  /** Invitation à prendre le bundle ; `null` pour un abonné Flowear ou un visiteur. */
  bundleUpgrade: { trialDaysLeft: number | null; offer?: { endsAt: string; percentOff: number; source?: 'welcome' | 'promo' } | null } | null
}


/** Hub façon App Store : colonne de navigation, puces de catégories, carte Tendances, rangées d'IA. */
export function Hub({ apps, upcoming, signedIn, bundleUpgrade }: HubProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryId | 'all'>('all')

  const everything = useMemo(() => [...apps, ...upcoming.map((u) => ({ ...u, soon: true }))], [apps, upcoming])
  const categories = useMemo(() => Array.from(new Set(everything.map((a) => a.category))), [everything])
  const normalized = query.trim().toLowerCase()
  const matches = (a: HubApp) =>
    (category === 'all' || a.category === category) && (!normalized || `${a.name} ${a.tagline}`.toLowerCase().includes(normalized))
  const available = apps.filter(matches)
  const coming = upcoming.filter(matches)

  const sidebar = (
    <>
      <Link href="/" className="flex items-center gap-2.5 px-2 text-lg font-semibold tracking-tight">
        <FlowearLogo size={26} />
        Flowear
      </Link>
      <label className="relative mt-4 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.hubStore.search}
          aria-label={t.hubStore.search}
          className="h-9 w-full rounded-lg bg-black/[0.05] pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 dark:bg-white/[0.08]"
        />
      </label>
      <nav className="mt-4 flex flex-col gap-0.5" aria-label={t.hubStore.categories}>
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-200 ${category === 'all' ? 'bg-black/[0.06] font-medium dark:bg-white/[0.1]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}`}
        >
          <LayoutGrid className="size-[18px]" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden />
          {t.hubStore.apps}
        </button>
        <p className="mt-4 px-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t.hubStore.categories}</p>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-200 ${category === c ? 'bg-black/[0.06] font-medium dark:bg-white/[0.1]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}`}
          >
            <CategoryIcon id={c} size={18} />
            {t.categories[c]}
          </button>
        ))}
      </nav>
      {bundleUpgrade ? <div className="mt-auto pt-6"><UpgradeCard target="bundle" trialDaysLeft={bundleUpgrade.trialDaysLeft} offer={bundleUpgrade.offer} /></div> : null}
      <div className={`${bundleUpgrade ? 'pt-3' : 'mt-auto pt-6'} flex items-center justify-between`}>
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
        {signedIn ? (
          <UserButton />
        ) : (
          <Link href="/sign-in" className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background">
            {t.hub.signIn}
          </Link>
        )}
      </div>
      <div className="mt-3 flex gap-3 px-1 text-[11px] text-muted-foreground">
        <Link href="/confidentialite" className="hover:text-foreground">{t.legal.privacy}</Link>
        <Link href="/conditions" className="hover:text-foreground">{t.legal.terms}</Link>
        <Link href="/studio" className="font-semibold text-foreground/80 hover:text-foreground">{t.studio.nav}</Link>
      </div>
    </>
  )

  return (
    <div className="flex min-h-dvh w-full">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-black/5 bg-[#f5f5f7] px-3 py-5 md:flex dark:border-white/[0.06] dark:bg-[#161617]">
        {sidebar}
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-16 pt-4 md:px-8 md:pt-6">
        <header className="mb-4 flex items-center justify-between gap-3 md:hidden">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <FlowearLogo size={24} />
            Flowear
          </Link>
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
            {signedIn ? (
              <UserButton />
            ) : (
              <Link href="/sign-in" className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background">
                {t.hub.signIn}
              </Link>
            )}
          </div>
        </header>
        <label className="relative mb-4 block md:hidden">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.hubStore.search}
            aria-label={t.hubStore.search}
            className="h-10 w-full rounded-xl bg-black/[0.05] pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 dark:bg-white/[0.08]"
          />
        </label>

        <h1 className="mb-3 text-3xl font-bold tracking-tight">{t.hubStore.apps}</h1>

        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 [scrollbar-width:none]">
          <Chip active={category === 'all'} onClick={() => setCategory('all')} label={t.hubStore.all} icon={<LayoutGrid className="size-4" style={{ color: FLOWEAR_INDIGO }} strokeWidth={1.75} aria-hidden />} />
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)} label={t.categories[c]} icon={<CategoryIcon id={c} />} />
          ))}
        </div>

        {available.length === 0 && coming.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">{t.hubStore.noResults}</p>
        ) : null}

        {available.length ? <Section title={t.hubStore.sectionStart} subtitle={t.hubStore.sectionStartSub} apps={available} /> : null}
        {coming.length ? <Section title={t.hubStore.sectionSoon} subtitle={t.hubStore.sectionSoonSub} apps={coming} /> : null}
      </main>
    </div>
  )
}

function Chip({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${active ? 'bg-foreground text-background' : 'bg-black/[0.06] hover:bg-black/[0.1] dark:bg-white/[0.1] dark:hover:bg-white/[0.16]'}`}
    >
      {icon}
      {label}
    </button>
  )
}

function Section({ title, subtitle, apps }: { title: string; subtitle: string; apps: HubApp[] }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>
      {/* `min-w-0` sur chaque case : une colonne de grille prend par défaut la largeur
          minimale de son contenu, donc une rangée un peu large repoussait toute la colonne
          hors de l'écran et le bouton « Ouvrir » se retrouvait coupé sur téléphone. */}
      <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {apps.map((a) => (
          <li key={a.slug} className="min-w-0">
            <AppRow app={a} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function AppRow({ app }: { app: HubApp }) {
  const { t } = useI18n()
  const body = (
    <>
      <AppIcon brand={app.brand} size={64} className={app.soon ? 'opacity-60 grayscale-[0.2]' : ''} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 font-semibold">
          <span className="truncate">{app.name}</span>
          {app.access === 'private' ? (
            <span className="shrink-0 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground dark:bg-white/[0.1]">
              {t.hub.private}
            </span>
          ) : null}
        </p>
        <p className="truncate text-sm text-muted-foreground">{app.tagline}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${app.soon ? 'bg-black/[0.06] text-muted-foreground dark:bg-white/[0.08]' : 'bg-blue-500/12 text-blue-600 dark:bg-blue-400/15 dark:text-blue-400'}`}
      >
        {app.soon ? t.hubStore.soon : t.hubStore.open}
      </span>
    </>
  )
  const cls = 'flex items-center gap-4 border-b border-black/[0.06] py-3 dark:border-white/[0.06]'
  if (app.soon) return <div className={`${cls} cursor-default`}>{body}</div>
  return (
    <Link href={`/${app.slug}`} className={`${cls} group rounded-xl transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]`}>
      {body}
    </Link>
  )
}
