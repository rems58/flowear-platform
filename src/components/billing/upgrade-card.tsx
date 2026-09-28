'use client'

import Link from 'next/link'
import { Layers, Sparkles } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { useCountdown } from './use-countdown'

/** Couleurs de Flowear, reprises du logo, quand la carte propose le bundle. */
const FLOWEAR_BRAND = { from: '#5E5CE6', to: '#8E5CF0' }

interface UpgradeCardProps {
  /** `app` : cette IA seulement. `bundle` : toutes les IA Flowear. */
  target: 'app' | 'bundle'
  /** Slug de l'IA pour `app` ; ignoré pour le bundle. */
  appSlug?: string
  /** Couleurs de l'IA pour `app` ; le bundle prend celles de Flowear. */
  brand?: { from: string; to: string }
  /** Jours restants de la semaine d'accueil ; `null` hors semaine. */
  trialDaysLeft: number | null
  /** Offre de bienvenue en cours : fin de fenêtre et remise. */
  offer?: { endsAt: string; percentOff: number; source?: 'welcome' | 'promo' } | null
}

/**
 * Invitation à s'abonner. Depuis une IA elle propose cette IA, depuis le hub elle propose
 * le bundle. Pendant la semaine d'accueil elle rappelle l'échéance. Rendue seulement à qui
 * n'a pas encore payé : c'est l'appelant qui en décide.
 */
export function UpgradeCard({ target, appSlug, brand, trialDaysLeft, offer = null }: UpgradeCardProps) {
  const { t, f } = useI18n()
  const left = useCountdown(offer?.endsAt)
  const colors = target === 'bundle' ? FLOWEAR_BRAND : (brand ?? FLOWEAR_BRAND)
  const href = target === 'bundle' ? '/pricing' : `/pricing?app=${appSlug}`
  const Icon = target === 'bundle' ? Layers : Sparkles
  const title = offer ? f(t.upgrade.titleOffer, { percent: offer.percentOff }) : target === 'bundle' ? t.upgrade.titleBundle : t.upgrade.title
  const pitch = offer
    ? left
      ? f(offer.source === 'promo' ? t.upgrade.pitchPromo : t.upgrade.pitchOffer, { hours: left.hours, minutes: String(left.minutes).padStart(2, '0') })
      : t.upgrade.pitchOfferSoon
    : trialDaysLeft !== null
      ? trialDaysLeft <= 1
        ? t.upgrade.pitchTrialLast
        : f(t.upgrade.pitchTrial, { days: trialDaysLeft })
      : target === 'bundle'
        ? t.upgrade.pitchBundle
        : t.upgrade.pitchFree

  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-2xl p-4 text-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] transition-transform duration-200 hover:-translate-y-0.5"
      style={{ background: `linear-gradient(135deg, ${colors.from} 0%, ${colors.to} 100%)` }}
    >
      {/* Reflet discret, façon icône d'app. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-white/20 blur-2xl transition-opacity duration-200 group-hover:opacity-80"
      />
      <span className="relative flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="size-4" strokeWidth={2} aria-hidden />
        {title}
      </span>
      <span className="relative mt-1 block text-xs leading-snug text-white/85">{pitch}</span>
      <span className="relative mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black">{t.upgrade.cta}</span>
    </Link>
  )
}
