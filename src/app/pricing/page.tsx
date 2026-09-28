import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { AppIcon } from '@/components/app-icon'
import { PlanComparison } from '@/components/billing/plan-comparison'
import { PricingCards } from '@/components/billing/pricing-cards'
import { buildComparison } from '@/core/billing/comparison'
import { currentOfferFor } from '@/core/billing/welcome-offer'
import { resolveAccess } from '@/core/billing/entitlements'
import { resolveConfig } from '@/core/config/resolve'
import { getAdminIds } from '@/lib/env'
import { remyApp } from '@/apps/remy/manifest'
import { appBrand } from '@/apps/types'
import { pick } from '@/core/i18n/locale'
import { getRepo } from '@/lib/db/repo'
import { canSeePrivate } from '@/lib/access'
import { getI18n } from '@/lib/i18n/server'
import { isStripeEnabled } from '@/lib/stripe'

type Props = { searchParams: Promise<{ app?: string }> }

/**
 * Tarifs : un prix par IA, un prix pour tout Flowear, mensuel ou annuel.
 * `?app=<slug>` vient du bandeau de mur : l'offre « une IA » vise alors cette IA.
 */
export default async function PricingPage({ searchParams }: Props) {
  const { userId } = await auth()
  const { locale, t } = await getI18n(userId)
  const sp = await searchParams
  await ensureAppsLoaded()
  const app = sp.app ? getApp(sp.app) : null
  // Une IA privée n'est proposée qu'à ses administrateurs, comme partout ailleurs.
  const visible = app && (app.access !== 'private' || (await canSeePrivate(userId))) ? app : null
  const repo = getRepo()
  const [billingUser, settings, subs] = await Promise.all([userId ? repo.users.get(userId) : Promise.resolve(null), repo.appSettings.list(), userId ? repo.subscriptions.listActive(userId) : Promise.resolve([])])
  const hasBilling = Boolean(billingUser?.stripeCustomerId)
  // Offre de bienvenue, si sa fenêtre est ouverte pour cette personne (jamais pour l'admin).
  const offerPlan = resolveAccess(subs, visible?.slug ?? 'flowear').plan
  const offer = userId && !getAdminIds().has(userId) ? currentOfferFor(billingUser, resolveConfig(visible ?? remyApp, settings), new Date(), offerPlan) : null
  // Par IA : son accroche et son tableau, déduits de son manifeste et des réglages.
  const rows = visible ? buildComparison(visible, settings, locale) : null
  const pitch = visible ? pick(visible.pitch ?? visible.tagline, locale) : t.pricing.subtitle
  const brand = visible ? appBrand(visible, locale) : null

  return (
    <main className={`mx-auto flex w-full flex-1 flex-col gap-8 px-6 pb-20 pt-16 ${rows ? 'max-w-5xl' : 'max-w-3xl'}`}>
      <header className="flex flex-col items-center gap-3 text-center">
        {brand ? <AppIcon brand={brand} size={72} /> : <span className="text-sm font-medium text-muted-foreground">Flowear</span>}
        <h1 className="text-balance text-4xl font-semibold tracking-[-0.03em]">{visible ? pick(visible.name, locale) : t.pricing.title}</h1>
        <p className="max-w-xl text-balance text-muted-foreground">{pitch}</p>
      </header>

      {/* Par IA : la carte de prix et le tableau côte à côte sur ordinateur, l'un sous l'autre sur téléphone. */}
      <div className={rows ? 'grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]' : ''}>
        <PricingCards
          stripeEnabled={isStripeEnabled()}
          appSlug={visible?.slug ?? null}
          appName={visible ? pick(visible.name, locale) : null}
          brand={brand}
          hasBilling={hasBilling}
          offer={offer}
        />
        {rows ? <PlanComparison rows={rows} brand={brand} /> : null}
      </div>

      <Link href="/" className="self-center rounded-full border border-border px-5 py-2 text-sm font-medium transition hover:bg-muted">
        {t.pricing.back}
      </Link>
      <div className="flex justify-center gap-4 text-xs text-muted-foreground">
        <Link href="/confidentialite" className="hover:text-foreground">{t.legal.privacy}</Link>
        <Link href="/conditions" className="hover:text-foreground">{t.legal.terms}</Link>
      </div>
    </main>
  )
}
