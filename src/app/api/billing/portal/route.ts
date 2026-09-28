import type { NextRequest } from 'next/server'
import { DEFAULTS } from '@/core/config/defaults'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** Page des commandes d'un membre Whop, où il résilie ou change de carte. */
const WHOP_MANAGE_URL = 'https://whop.com/orders'
import { getServerEnv } from '@/lib/env'
import { getStripe } from '@/lib/stripe'

/**
 * POST : ouvre le portail client Stripe (changer de carte, passer au bundle, annuler en un clic)
 * et renvoie son URL. Réservé à qui a déjà un client Stripe.
 */
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await requireUser()
  await rateLimitOrThrow(`billing:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'billing.portal' })
  const repo = getRepo()
  const user = await repo.users.get(userId)
  // Abonnement encaissé par Whop : il se gère là-bas (carte, résiliation), pas sur le portail Stripe.
  if (!user?.stripeCustomerId && (await repo.subscriptions.hasWhop(userId))) return json({ url: WHOP_MANAGE_URL })
  const stripe = getStripe()
  if (!stripe) throw new AppError('STRIPE_UNAVAILABLE', 503, 'Paiement indisponible')
  if (!user?.stripeCustomerId) throw AppError.notFound('Aucun abonnement')

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${getServerEnv().NEXT_PUBLIC_APP_URL}/pricing`,
  })
  return json({ url: session.url })
}, 'billing.portal')
