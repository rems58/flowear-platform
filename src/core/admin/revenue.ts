import { BUNDLE_SLUG } from '@/core/billing/entitlements'
import { PRICES } from '@/core/billing/prices'

/** Une ligne de la vue `paid_subscriptions` : ce que la base sait d'un abonnement payant. */
export interface PaidSubscription {
  userId: string
  appSlug: string
  interval: 'month' | 'year' | null
  status: string
}

export interface Revenue {
  /** Revenu mensuel récurrent, en euros, l'annuel ramené au mois. */
  mrr: number
  subscribers: number
  /** Revenu moyen par abonné et par mois. */
  arpu: number
  bundleShare: number | null
}

/**
 * Revenu calculé depuis la grille des prix, pas depuis Stripe : la base ne connaît que
 * l'IA et la périodicité. Un abonnement sans périodicité (ligne antérieure au webhook qui
 * la pose) est compté au mensuel, le cas le plus fréquent, plutôt qu'ignoré.
 */
export function computeRevenue(rows: readonly PaidSubscription[]): Revenue {
  let mrr = 0
  let bundle = 0
  const people = new Set<string>()
  for (const r of rows) {
    const grid = r.appSlug === BUNDLE_SLUG ? PRICES.bundle : PRICES.app
    mrr += r.interval === 'year' ? grid.yearly / 12 : grid.monthly
    if (r.appSlug === BUNDLE_SLUG) bundle++
    people.add(r.userId)
  }
  const subscribers = people.size
  return { mrr, subscribers, arpu: subscribers ? mrr / subscribers : 0, bundleShare: rows.length ? bundle / rows.length : null }
}
