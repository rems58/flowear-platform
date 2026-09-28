import type { AppConfig } from '@/core/config/schema'
import type { User } from '@/core/data/types'

export interface WelcomeOffer {
  /** Fin de la fenêtre, ISO. */
  endsAt: string
  percentOff: number
  /** D'où vient l'offre : les 72 h après l'inscription, ou une fenêtre ouverte par l'admin. */
  source: 'welcome' | 'promo'
}

/**
 * L'offre de bienvenue pour cette personne : Pro à moitié prix le premier mois, pendant les
 * heures qui suivent l'inscription. Une seule fois : consommée au paiement, plus jamais
 * proposée. Absente pour qui a déjà payé, pour l'admin, et quand `offers.welcome.hours` vaut 0.
 * Les fenêtres promo décidées par l'admin passent par un autre chemin.
 */
export function welcomeOfferFor(user: User | null, config: AppConfig, now: Date, plan: 'free' | 'paid'): WelcomeOffer | null {
  const { hours, percentOff } = config.offers.welcome
  if (!user || hours <= 0 || plan === 'paid' || user.welcomeOfferUsedAt) return null
  const endsAt = new Date(new Date(user.createdAt).getTime() + hours * 3_600_000)
  if (endsAt.getTime() <= now.getTime()) return null
  return { endsAt: endsAt.toISOString(), percentOff, source: 'welcome' }
}

/**
 * Fenêtre promo ouverte par l'admin (`offers.promo`, réglage à chaud) : même remise, pour tout
 * gratuit, entre deux dates. Sans limite « une fois par personne » : c'est l'admin qui décide
 * quand elle s'ouvre. Absente hors fenêtre et pour un abonné.
 */
export function promoOfferFor(config: AppConfig, now: Date, plan: 'free' | 'paid'): WelcomeOffer | null {
  const promo = config.offers.promo
  if (!promo || plan === 'paid') return null
  const from = new Date(promo.from).getTime()
  const until = new Date(promo.until).getTime()
  if (Number.isNaN(from) || Number.isNaN(until) || now.getTime() < from || now.getTime() >= until) return null
  return { endsAt: new Date(until).toISOString(), percentOff: config.offers.welcome.percentOff, source: 'promo' }
}

/** L'offre à montrer : celle de bienvenue si sa fenêtre est ouverte, sinon la fenêtre promo. */
export function currentOfferFor(user: User | null, config: AppConfig, now: Date, plan: 'free' | 'paid'): WelcomeOffer | null {
  return welcomeOfferFor(user, config, now, plan) ?? promoOfferFor(config, now, plan)
}

/** Prix du premier mois avec l'offre, arrondi au centime. */
export function discountedPrice(monthly: number, percentOff: number): number {
  return Math.round(monthly * (100 - percentOff)) / 100
}
