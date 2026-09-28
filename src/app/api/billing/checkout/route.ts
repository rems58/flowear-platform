import type { NextRequest } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { z } from 'zod'
import { getApp } from '@/apps/registry'
import { BILLING_INTERVALS, CHECKOUT_TARGETS, priceEnvKey } from '@/core/billing/prices'
import { resolveAppPriceId } from '@/core/billing/stripe-catalog'
import { BUNDLE_SLUG } from '@/core/billing/entitlements'
import { DEFAULTS } from '@/core/config/defaults'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { currentOfferFor } from '@/core/billing/welcome-offer'
import { resolveAccess } from '@/core/billing/entitlements'
import { resolveConfig } from '@/core/config/resolve'
import { getServerEnv } from '@/lib/env'
import { getStripe } from '@/lib/stripe'

const bodySchema = z.object({
  target: z.enum(CHECKOUT_TARGETS),
  interval: z.enum(BILLING_INTERVALS),
  /** Requis pour `target: 'app'` : l'IA qu'on abonne. */
  appSlug: z.string().regex(/^[a-z0-9-]{2,32}$/).optional(),
})

/**
 * POST : ouvre une session Stripe Checkout et renvoie son URL.
 * L'identité vient de la session Clerk ; le slug est vérifié contre le registre, jamais cru sur parole.
 */
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await requireUser()
  await rateLimitOrThrow(`billing:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'billing.checkout' })
  const stripe = getStripe()
  if (!stripe) throw new AppError('STRIPE_UNAVAILABLE', 503, 'Paiement indisponible')

  const body = await readJson(req, bodySchema, 4_000)
  const env = getServerEnv()

  // Cible : une IA existante et accessible, ou le bundle. Le prix d'une IA porte son nom,
  // celui du bundle vient de la configuration.
  let appSlug = BUNDLE_SLUG
  let priceId: string | undefined
  if (body.target === 'app') {
    const app = body.appSlug ? getApp(body.appSlug) : null
    if (!app) throw AppError.notFound('IA introuvable')
    await requireAppAccess(app, userId)
    appSlug = app.slug
    priceId = await resolveAppPriceId(stripe, app, body.interval)
  } else {
    priceId = env[priceEnvKey('bundle', body.interval)]
  }
  if (!priceId) throw new AppError('STRIPE_UNAVAILABLE', 503, 'Paiement indisponible')

  const repo = getRepo()
  const user = await repo.users.get(userId)
  let customerId = user?.stripeCustomerId ?? null
  if (!customerId) {
    // L'email vient de Clerk : il alimente le reçu Stripe, jamais une décision d'accès.
    const clerkUser = await currentUser()
    const email = user?.email ?? clerkUser?.primaryEmailAddress?.emailAddress ?? undefined
    const customer = await stripe.customers.create({ email, metadata: { clerkUserId: userId } })
    customerId = customer.id
    await repo.users.setStripeCustomerId(userId, customerId)
  }

  // Offre de bienvenue : moitié prix le premier mois, au mois seulement, si la fenêtre est
  // encore ouverte pour cette personne. Le coupon est posé par nous ; Stripe n'accepte pas en
  // plus un code saisi à la main, on ne propose donc le champ qu'en dehors de l'offre.
  const [subs, settings] = await Promise.all([repo.subscriptions.listActive(userId), repo.appSettings.list()])
  const config = resolveConfig(body.target === 'app' ? getApp(appSlug)! : getApp('remy')!, settings)
  const offer = body.interval === 'monthly' && env.STRIPE_COUPON_WELCOME ? currentOfferFor(user, config, new Date(), resolveAccess(subs, appSlug).plan) : null
  const returnTo = body.target === 'app' ? `/${appSlug}` : '/'
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    // Les métadonnées voyagent jusqu'à l'abonnement : le webhook sait quoi ouvrir, pour qui.
    subscription_data: { metadata: { clerkUserId: userId, appSlug } },
    metadata: { clerkUserId: userId, appSlug, ...(offer?.source === 'welcome' ? { welcomeOffer: '1' } : {}), ...(offer ? { offerSource: offer.source } : {}) },
    // Marchand officiel : Stripe calcule, collecte et reverse la TVA de plus de 80 pays,
    // gère la fraude, les litiges et le support sur la transaction. Rien à déclarer de notre côté.
    managed_payments: { enabled: true },
    ...(offer ? { discounts: [{ coupon: env.STRIPE_COUPON_WELCOME }] } : { allow_promotion_codes: true }),
    success_url: `${env.NEXT_PUBLIC_APP_URL}${returnTo}?abonnement=ok`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pricing`,
  })
  if (!session.url) throw AppError.internal()

  await repo.events.track({ name: 'checkout_started', userId, appSlug, props: { target: body.target, interval: body.interval, welcomeOffer: Boolean(offer) } })
  return json({ url: session.url })
}, 'billing.checkout')

/** Clerk fournit l'email : la route a besoin du runtime Node, pas de l'edge. */
export const runtime = 'nodejs'
