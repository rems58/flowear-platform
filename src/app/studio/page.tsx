import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { Check } from 'lucide-react'
import { after } from 'next/server'
import { getApp } from '@/apps/registry'
import { appBrand } from '@/apps/types'
import { AppIcon } from '@/components/app-icon'
import { FlowearLogo } from '@/components/flowear-logo'
import { StudioForm } from '@/components/studio/studio-form'
import { UtmCapture } from '@/components/utm-capture'
import { STUDIO_SHARE_PERCENT } from '@/core/studio/waitlist'
import { PRICES } from '@/core/billing/prices'
import { NET_RATIO } from '@/core/studio/economics'
import { SUPPORTED_LOCALES, pick } from '@/core/i18n/locale'
import { readUtm, recordVisit } from '@/lib/analytics/visit'
import { getRepo } from '@/lib/db/repo'
import { fmt } from '@/lib/i18n/messages'
import { getI18n, resolveLocale } from '@/lib/i18n/server'
import remy from '../../../public/remy.webp'

const SITE = 'https://flowear.app'
/** Indigo Flowear, et sa version profonde pour la bannière. */
const INDIGO = '#5E5CE6'
const INDIGO_DEEP = '#3F3DB8'

export async function generateMetadata(): Promise<Metadata> {
  const { userId } = await auth()
  const { locale, source } = await resolveLocale(userId)
  const { t } = await getI18n(userId)
  return {
    title: t.studio.eyebrow,
    description: t.studio.pitch,
    alternates: {
      canonical: source === 'query' ? `${SITE}/studio?lang=${locale}` : `${SITE}/studio`,
      languages: { ...Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `${SITE}/studio?lang=${l}`])), 'x-default': `${SITE}/studio` },
    },
  }
}

/**
 * Flowear Studio, façon boutique : une barre blanche, une grande bannière indigo avec le
 * formulaire dedans, trois étapes, la preuve Amorce en bloc sombre, le partage, le fondateur, les
 * questions. Titres fins et centrés, blocs pleins, pas de filets : la grammaire d'un store, aux
 * couleurs de Flowear. Cinq langues.
 */
export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const utm = readUtm(await searchParams)
  after(() => recordVisit('/studio', utm))
  const { userId } = await auth()
  const { locale, t } = await getI18n(userId)
  const count = await getRepo().studioWaitlist.count()
  const amorce = getApp('amorce')
  // Exemple chiffré du partage, sur le vrai prix d'une IA : même ratio net que le calcul des versements.
  const euro = new Intl.NumberFormat(locale, { style: 'currency', currency: PRICES.currency })
  const netPerSub = Math.round(PRICES.app.monthly * NET_RATIO * 100) / 100
  const yoursPerSub = Math.round(netPerSub * (STUDIO_SHARE_PERCENT / 100) * 100) / 100

  const steps = [
    { title: t.studio.s1t, body: t.studio.s1b },
    { title: t.studio.s2t, body: t.studio.s2b },
    { title: t.studio.s3t, body: t.studio.s3b },
  ]
  const faq = [
    { q: t.studio.q1, a: t.studio.a1 },
    { q: t.studio.q2, a: t.studio.a2 },
    { q: t.studio.q3, a: t.studio.a3 },
  ]

  return (
    <main className="bg-background text-foreground">
      <UtmCapture />

      {/* Barre : logo, trois liens, un bouton plein. */}
      <nav className="sticky top-0 z-30 border-b border-black/[0.06] bg-background/90 backdrop-blur dark:border-white/[0.08]">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 md:px-8">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <FlowearLogo size={26} />
              Flowear
            </Link>
            <div className="hidden items-center gap-6 text-[15px] font-medium md:flex">
              <span className="text-foreground">{t.studio.navStudio}</span>
              <Link href="/amorce" className="text-muted-foreground transition-colors hover:text-foreground">
                Amorce
              </Link>
              <Link href="/pricing" className="text-muted-foreground transition-colors hover:text-foreground">
                {t.pricing.title}
              </Link>
            </div>
          </div>
          <a href="#liste" className="inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: INDIGO }}>
            {t.studio.heroCta}
          </a>
        </div>
      </nav>

      {/* Bannière : indigo plein, titre fin, formulaire à droite dans une carte blanche. */}
      <section id="liste" className="text-white" style={{ background: `linear-gradient(120deg, ${INDIGO_DEEP} 0%, ${INDIGO} 60%, #7B6CF0 100%)` }}>
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 md:grid-cols-12 md:px-8 md:py-20">
          <div className="flex flex-col justify-center gap-6 md:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              {t.studio.eyebrow} · {t.studio.promo}
            </p>
            <h1 className="text-balance text-4xl font-light leading-[1.05] tracking-[-0.02em] sm:text-5xl md:text-6xl">{t.studio.title}</h1>
            <p className="max-w-xl text-pretty text-lg leading-relaxed text-white/85">{t.studio.heroSub}</p>
            <ul className="grid gap-x-8 gap-y-2.5 text-[15px] sm:grid-cols-2">
              {[fmt(t.studio.fact1, { self: STUDIO_SHARE_PERCENT }), t.studio.fact2, t.studio.fact3, t.studio.fact4, t.studio.fact5, t.studio.fact6, t.studio.fact7, t.studio.fact8, t.studio.fact9].map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="mt-1 size-4 shrink-0" strokeWidth={2.5} aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white p-1 text-foreground shadow-2xl dark:bg-card">
              <StudioForm initialCount={count} />
            </div>
          </div>
        </div>
      </section>

      {/* Étapes : trois cartes claires, numéro indigo. */}
      <section className="mx-auto w-full max-w-7xl px-5 py-16 md:px-8 md:py-24">
        <h2 className="text-center text-3xl font-light tracking-[-0.02em] md:text-5xl">{t.studio.how}</h2>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-3xl bg-black/[0.04] p-7 dark:bg-white/[0.06]">
              <span className="flex size-10 items-center justify-center rounded-full text-base font-semibold text-white" style={{ background: INDIGO }}>
                {i + 1}
              </span>
              <p className="mt-5 text-xl font-semibold tracking-tight">{s.title}</p>
              <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Preuve : bloc sombre, la conversation Amorce en grand, comme une bannière de jeu. */}
      <section className="bg-[#0f0f12] text-white">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 md:grid-cols-12 md:px-8 md:py-24">
          <div className="flex flex-col justify-center gap-4 md:col-span-5">
            {amorce ? <AppIcon brand={appBrand(amorce, locale)} size={64} /> : null}
            <h2 className="text-3xl font-light tracking-[-0.02em] md:text-4xl">{amorce ? pick(amorce.name, locale) : 'Amorce'}</h2>
            <p className="text-white/75">{t.studio.mockCaption}</p>
            <Link href="/amorce" className="mt-2 inline-flex h-10 w-fit items-center rounded-full bg-white px-5 text-sm font-semibold text-black transition-opacity hover:opacity-90">
              {t.studio.heroSecondary}
            </Link>
          </div>
          <div className="md:col-span-7">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
              <div className="flex flex-col gap-3 text-[15px] leading-6">
                <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5" style={{ background: INDIGO }}>
                  {t.studio.mockUser}
                </p>
                <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5">{t.studio.mockAi1}</p>
                <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5" style={{ background: INDIGO }}>
                  {t.studio.mockUserEnergy}
                </p>
                <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5">{t.studio.mockAi2}</p>
                <span className="mt-1 inline-flex w-fit items-center rounded-full bg-white px-3.5 py-1 text-sm font-semibold text-black">{t.studio.mockDone}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Partage : de l'air au-dessus (le bloc sombre s'arrête net), une tuile pleine, le nombre en très
          grand, et un exemple chiffré sur un vrai prix pour que 50 % veuille dire quelque chose. */}
      <section className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8 md:py-28">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: INDIGO }}>{t.studio.shareEyebrow}</p>
        <h2 className="mt-3 text-center text-3xl font-light tracking-[-0.02em] md:text-5xl">{t.studio.shareTitle}</h2>
        <div className="mx-auto mt-12 flex max-w-3xl flex-col gap-8 rounded-3xl p-6 text-white shadow-[0_30px_80px_-30px_rgba(94,92,230,0.6)] md:p-10" style={{ background: `linear-gradient(145deg, ${INDIGO} 0%, #8B7CF6 100%)` }}>
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="flex flex-col gap-2">
              <p className="text-lg font-medium">{t.studio.shareYou}</p>
              <p className="max-w-sm text-sm text-white/80">{t.studio.shareSame}</p>
            </div>
            <p className="text-7xl font-light leading-none tracking-[-0.03em] md:text-8xl">
              {STUDIO_SHARE_PERCENT}
              <span className="align-top text-3xl"> %</span>
            </p>
          </div>
          <div className="border-t border-white/20 pt-6">
            <p className="mb-3 text-xs uppercase tracking-wide text-white/70">{fmt(t.studio.shareExample, { price: euro.format(PRICES.app.monthly) })}</p>
            <div className="grid grid-cols-3 gap-2 text-center md:gap-3">
              {[
                [t.studio.shareSub, euro.format(PRICES.app.monthly)],
                [t.studio.shareNet, euro.format(netPerSub)],
                [t.studio.shareYours, euro.format(yoursPerSub)],
              ].map(([label, value], i) => (
                <div key={label} className={`rounded-2xl px-2 py-4 md:px-3 ${i === 2 ? 'bg-white text-[#3F3DB8]' : 'bg-white/10'}`}>
                  <p className="text-xl font-semibold tracking-tight md:text-3xl">{value}</p>
                  <p className={`mt-1 text-xs ${i === 2 ? 'text-[#3F3DB8]/80' : 'text-white/75'}`}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">{t.studio.shareNote}</p>
      </section>

      {/* Fondateur : bloc indigo profond, photo, citation. */}
      <section className="text-white" style={{ background: INDIGO_DEEP }}>
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-5 py-14 md:flex-row md:items-center md:gap-10 md:px-8 md:py-20">
          <Image src={remy} alt="Rémy Magne" width={120} height={120} className="size-24 rounded-full object-cover ring-4 ring-white/20 md:size-28" />
          <div className="flex flex-col gap-3">
            <p className="text-pretty text-2xl font-light leading-snug md:text-3xl">{t.studio.founderLine}</p>
            <p className="text-sm text-white/75">Rémy Magne · {t.studio.founderRole}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-5 py-16 md:px-8 md:py-24">
        <h2 className="text-center text-3xl font-light tracking-[-0.02em] md:text-4xl">{t.studio.faq}</h2>
        <div className="mt-8 flex flex-col gap-3">
          {faq.map((item) => (
            <details key={item.q} className="group rounded-2xl bg-black/[0.04] px-6 py-4 dark:bg-white/[0.06]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium">
                {item.q}
                <span aria-hidden className="transition-transform duration-200 group-open:rotate-45" style={{ color: INDIGO }}>
                  +
                </span>
              </summary>
              <p className="pt-3 text-[15px] leading-6 text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="border-t border-black/[0.06] dark:border-white/[0.08]">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-muted-foreground md:px-8">
          <div className="flex items-center gap-2">
            <FlowearLogo size={20} />
            <span>Flowear</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/confidentialite" className="hover:text-foreground">
              {t.legal.privacy}
            </Link>
            <Link href="/conditions" className="hover:text-foreground">
              {t.legal.terms}
            </Link>
            <Link href="/pricing" className="hover:text-foreground">
              {t.pricing.title}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
