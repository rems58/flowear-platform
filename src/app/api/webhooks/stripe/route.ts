import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { clientIp, rateLimitOrThrow } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { getServerEnv } from '@/lib/env'
import { getStripe } from '@/lib/stripe'

/** Statuts qui ouvrent l'accès : voir `ACTIVE_STATUSES` dans `entitlements.ts`. */
const GRANTS_ACCESS = new Set(['active', 'trialing', 'past_due'])

/** Fin de la période en cours : portée par la ligne d'abonnement depuis l'API 2026-08-26. */
/** Mensuel ou annuel, lu sur la ligne d'abonnement : sert au revenu mensuel de l'admin. */
function billingInterval(subscription: Stripe.Subscription): 'month' | 'year' | null {
  const interval: string | undefined = subscription.items.data[0]?.price?.recurring?.interval
  if (interval === 'month') return 'month'
  if (interval === 'year') return 'year'
  return null
}

function periodEnd(subscription: Stripe.Subscription): string | null {
  const seconds = subscription.items.data[0]?.current_period_end
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null
}

/**
 * Webhook Stripe : signature vérifiée avant toute lecture, chaque événement traité une seule fois,
 * puis la ligne `subscriptions` est créée ou mise à jour. L'identité vient des métadonnées posées
 * au checkout, jamais du corps brut de la requête.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const ip = clientIp(req)
  try {
    await rateLimitOrThrow(`webhook:stripe:${ip}`, 300, 60_000, { ip, route: 'webhooks.stripe' })
  } catch {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const env = getServerEnv()
  const stripe = getStripe()
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature ?? '', env.STRIPE_WEBHOOK_SECRET)
  } catch {
    await getRepo().audit.log({ action: 'webhook_signature_invalid', details: { source: 'stripe' }, ip })
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  const repo = getRepo()
  // Stripe rejoue les événements : une seule prise en compte, même en cas de double livraison.
  if (!(await repo.stripeEvents.markProcessed(event.id, event.type))) {
    return NextResponse.json({ ok: true, alreadyProcessed: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
        if (subscriptionId) await sync(stripe, await stripe.subscriptions.retrieve(subscriptionId))
        // Offre de bienvenue consommée : plus jamais proposée à cette personne.
        if (session.metadata?.welcomeOffer === '1' && session.metadata.clerkUserId) {
          await repo.users.markWelcomeOfferUsed(session.metadata.clerkUserId, new Date())
          await repo.events.track({ name: 'welcome_offer_used', userId: session.metadata.clerkUserId, appSlug: session.metadata.appSlug ?? null, props: {} })
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await sync(stripe, event.data.object)
        break
      }
      case 'invoice.paid': {
        // Paiement réellement encaissé (après coupon), pour les commissions d'affiliation en
        // pourcentage. L'identité vient des métadonnées de l'abonnement, figées sur la facture.
        const invoice = event.data.object
        const details = invoice.parent?.subscription_details
        const userId = details?.metadata?.clerkUserId
        if (userId && invoice.amount_paid > 0) {
          const subscriptionId = typeof details?.subscription === 'string' ? details.subscription : details?.subscription?.id
          await repo.events.track({
            name: 'payment',
            userId,
            appSlug: details?.metadata?.appSlug ?? null,
            props: { amountCents: invoice.amount_paid, currency: invoice.currency, invoiceId: invoice.id, subscriptionId: subscriptionId ?? null },
          })
        }
        break
      }
      default:
        break
    }
  } catch (error) {
    console.error('[webhooks.stripe]', event.type, error)
    // 500 : Stripe rejouera. L'événement est déjà marqué, on le retire pour que le rejeu agisse.
    await repo.stripeEvents.forget(event.id)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** Écrit l'état d'un abonnement Stripe dans `subscriptions` et journalise l'événement métier. */
async function sync(stripe: Stripe, subscription: Stripe.Subscription): Promise<void> {
  const repo = getRepo()
  const userId = subscription.metadata?.clerkUserId
  const appSlug = subscription.metadata?.appSlug
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  if (!userId || !appSlug) {
    // Abonnement créé hors de notre parcours (console Stripe) : on ne devine pas à qui l'ouvrir.
    await repo.audit.log({ action: 'stripe_subscription_without_metadata', details: { subscriptionId: subscription.id, customerId } })
    return
  }

  const status = subscription.status
  await repo.subscriptions.upsertFromStripe({
    userId,
    appSlug,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items.data[0]?.price?.id ?? null,
    status,
    currentPeriodEnd: periodEnd(subscription),
    interval: billingInterval(subscription),
  })
  await repo.users.setStripeCustomerId(userId, customerId)
  await repo.events.track({
    name: GRANTS_ACCESS.has(status) ? 'subscribed' : 'churned',
    userId,
    appSlug,
    props: { status, subscriptionId: subscription.id, priceId: subscription.items.data[0]?.price?.id ?? null },
  })
}

/** La signature se vérifie sur le corps brut : pas de mise en cache, runtime Node. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
