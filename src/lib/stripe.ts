import 'server-only'
import Stripe from 'stripe'
import { getServerEnv } from '@/lib/env'

/** Version d'API épinglée : une mise à jour du paquet ne change pas le comportement sans relecture. */
export const STRIPE_API_VERSION = '2026-08-26.dahlia' as const

let client: Stripe | null = null

/** Client Stripe, construit au premier appel. `null` tant que la clé n'est pas posée : rien ne casse. */
export function getStripe(): Stripe | null {
  const key = getServerEnv().STRIPE_SECRET_KEY
  if (!key) return null
  if (!client) client = new Stripe(key, { apiVersion: STRIPE_API_VERSION, typescript: true })
  return client
}

/** Stripe configuré ou non : l'interface masque les boutons de paiement quand il ne l'est pas. */
export function isStripeEnabled(): boolean {
  const env = getServerEnv()
  // Les prix d'une IA se créent à la volée depuis son manifeste ; seul le bundle est configuré.
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_BUNDLE_MONTHLY && env.STRIPE_PRICE_BUNDLE_YEARLY)
}
