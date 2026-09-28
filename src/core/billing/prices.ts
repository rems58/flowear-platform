/**
 * Grille tarifaire (décision du 16 septembre 2026). Stripe (phase 4) créera ses prix à partir d'ici.
 * Un abonnement par IA n'ouvre que cette IA ; le bundle Flowear ouvre toutes les IA.
 * Annuel = dix mois payés, deux offerts. Annulation en un clic, pas de garantie de remboursement.
 */
export const PRICES = {
  currency: 'EUR',
  app: { monthly: 9, yearly: 90 },
  bundle: { monthly: 30, yearly: 300 },
} as const

export const TRIAL_DAYS_DEFAULT = 7

/** Ce qu'on achète : une IA précise, ou le bundle qui les ouvre toutes. */
export const CHECKOUT_TARGETS = ['app', 'bundle'] as const
export type CheckoutTarget = (typeof CHECKOUT_TARGETS)[number]

export const BILLING_INTERVALS = ['monthly', 'yearly'] as const
export type BillingInterval = (typeof BILLING_INTERVALS)[number]

/** Montant affiché et facturé, en euros, pour une cible et une périodicité. */
export function priceFor(target: CheckoutTarget, interval: BillingInterval): number {
  const grid = target === 'bundle' ? PRICES.bundle : PRICES.app
  return interval === 'yearly' ? grid.yearly : grid.monthly
}

/**
 * Variable d'environnement portant l'identifiant de prix du bundle. Les prix d'une IA ne
 * sont pas configurés : ils se créent depuis son manifeste (`stripe-catalog.ts`).
 */
export function priceEnvKey(target: 'bundle', interval: BillingInterval): 'STRIPE_PRICE_BUNDLE_MONTHLY' | 'STRIPE_PRICE_BUNDLE_YEARLY' {
  void target
  return interval === 'yearly' ? 'STRIPE_PRICE_BUNDLE_YEARLY' : 'STRIPE_PRICE_BUNDLE_MONTHLY'
}
