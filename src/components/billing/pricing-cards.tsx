'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Brand } from '@/apps/types'
import { PRICES, priceFor, type BillingInterval } from '@/core/billing/prices'
import { ManageSubscriptionButton, SubscribeButton } from './subscribe-buttons'
import { IntervalToggle } from './interval-toggle'
import { fmt } from '@/lib/i18n/messages'
import { useI18n } from '@/lib/i18n/provider'
import { discountedPrice } from '@/core/billing/welcome-offer'
import { useCountdown } from './use-countdown'

interface PricingCardsProps {
  stripeEnabled: boolean
  /** IA visée (venue de `?app=`), déjà validée côté serveur. Absente : offre Flowear. */
  appSlug: string | null
  appName: string | null
  /** Couleurs de l'IA : bouton et accents. Absente : neutre (bundle). */
  brand?: Brand | null
  /** La personne a déjà un client Stripe : on lui propose le portail. */
  hasBilling: boolean
  /** Offre de bienvenue en cours : moitié prix le premier mois, au mois. */
  offer?: { endsAt: string; percentOff: number; source?: 'welcome' | 'promo' } | null
}

export function PricingCards({ stripeEnabled, appSlug, appName, brand = null, hasBilling, offer = null }: PricingCardsProps) {
  const { t, locale } = useI18n()
  const left = useCountdown(offer?.endsAt)
  // 4,50 en français, 4.50 en anglais ; 9 reste 9.
  const money = (v: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v)
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  // Le contexte décide de ce qu'on achète : depuis une IA, cette IA seule ; depuis le hub,
  // toutes les IA. On ne vend jamais le bundle depuis l'intérieur d'une IA.
  const offers = appSlug
    ? [{ key: 'app' as const, title: appName ?? t.pricing.perApp, features: t.billing.appFeatures }]
    : [{ key: 'bundle' as const, title: t.pricing.bundle, features: t.billing.bundleFeatures }]
  const gradient = brand ? `linear-gradient(135deg, ${brand.from}, ${brand.to})` : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">
        <IntervalToggle value={interval} onChange={setInterval} />
      </div>
      <section className={`grid gap-4 ${offers.length > 1 ? 'sm:grid-cols-2' : 'mx-auto w-full max-w-sm lg:max-w-none'}`}>
        {offers.map((o) => {
          const euros = priceFor(o.key, interval)
          const monthly = o.key === 'bundle' ? PRICES.bundle.monthly : PRICES.app.monthly
          return (
            <div
              key={o.key}
              className="relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_-12px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.04] dark:bg-[#1c1c1e] dark:ring-white/[0.06]"
            >
              {gradient ? <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: gradient }} aria-hidden /> : null}
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{o.title}</h2>
                <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground dark:bg-white/[0.1]">{t.billing.planLabel}</span>
              </div>
              <div>
                {offer && interval === 'monthly' ? (
                  <>
                    <p className="flex flex-wrap items-baseline gap-2">
                      <span className="text-4xl font-semibold tracking-tight">{fmt(t.billing.offerFirstMonth, { price: money(discountedPrice(euros, offer.percentOff)) })}</span>
                      <span className="text-base text-muted-foreground line-through">{fmt(t.billing.perMonthShort, { price: euros })}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{fmt(t.billing.offerThen, { price: euros })}</p>
                    <p className="mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: gradient ?? 'var(--primary)' }}>
                      {left ? fmt(t.billing.offerLeft, { hours: left.hours, minutes: String(left.minutes).padStart(2, '0') }) : t.billing.offerSoon}
                    </p>
                  </>
                ) : (
                  <p className="text-4xl font-semibold tracking-tight">{fmt(interval === 'yearly' ? t.billing.perYearShort : t.billing.perMonthShort, { price: euros })}</p>
                )}
                {interval === 'yearly' ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t.billing.yearlyHint} ({fmt(t.billing.perMonthShort, { price: monthly })})
                  </p>
                ) : null}
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {(o.key === 'app' ? t.billing.perks : [o.features]).map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: gradient ?? 'var(--primary)' }} aria-hidden>
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col gap-3 pt-2">
                <SubscribeButton enabled={stripeEnabled} appSlug={appSlug} interval={interval} target={o.key} gradient={gradient} />
                <p className="text-center text-xs text-muted-foreground">{t.pricing.cancel}</p>
              </div>
            </div>
          )
        })}
      </section>
      {hasBilling ? (
        <div className="flex justify-center">
          <ManageSubscriptionButton />
        </div>
      ) : null}
    </div>
  )
}
