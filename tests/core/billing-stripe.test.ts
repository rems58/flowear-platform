import { describe, expect, it } from 'vitest'
import { BILLING_INTERVALS, CHECKOUT_TARGETS, PRICES, priceEnvKey, priceFor } from '@/core/billing/prices'
import { resolveAccess, resolvePlan } from '@/core/billing/entitlements'
import { createMemoryRepo } from '@/core/data/memory-repo'

const now = new Date('2026-09-16T12:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString()

describe('grille tarifaire', () => {
  it('chaque cible et périodicité a un prix', () => {
    for (const target of CHECKOUT_TARGETS) {
      for (const interval of BILLING_INTERVALS) {
        expect(priceFor(target, interval)).toBeGreaterThan(0)
      }
    }
    // Annuel = dix mois payés, deux offerts.
    expect(priceFor('app', 'yearly')).toBe(PRICES.app.monthly * 10)
    expect(priceFor('bundle', 'yearly')).toBe(PRICES.bundle.monthly * 10)
  })

  it('seul le bundle passe par une variable d’environnement', () => {
    expect(priceEnvKey('bundle', 'monthly')).toBe('STRIPE_PRICE_BUNDLE_MONTHLY')
    expect(priceEnvKey('bundle', 'yearly')).toBe('STRIPE_PRICE_BUNDLE_YEARLY')
  })
})

describe('abonnements Stripe', () => {
  it('un abonnement écrit par le webhook ouvre l’IA, le bundle ouvre tout', async () => {
    const { repo } = createMemoryRepo()
    await repo.subscriptions.upsertFromStripe({
      userId: 'u',
      appSlug: 'remy',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_app_monthly',
      status: 'active',
      interval: 'month' as const, currentPeriodEnd: days(30),
    })
    let subs = await repo.subscriptions.listActive('u')
    expect(resolvePlan(subs, 'remy', now)).toBe('paid')
    expect(resolvePlan(subs, 'teinty', now)).toBe('free')

    await repo.subscriptions.upsertFromStripe({
      userId: 'u',
      appSlug: 'flowear',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_2',
      stripePriceId: 'price_bundle_monthly',
      status: 'active',
      interval: 'month' as const, currentPeriodEnd: days(30),
    })
    subs = await repo.subscriptions.listActive('u')
    expect(resolvePlan(subs, 'teinty', now)).toBe('paid')
  })

  it('un événement rejoué met à jour la ligne, il n’en crée pas une seconde', async () => {
    const { repo } = createMemoryRepo()
    const base = { userId: 'u', appSlug: 'remy', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripePriceId: 'price_1' }
    await repo.subscriptions.upsertFromStripe({ ...base, status: 'active', interval: 'month' as const, currentPeriodEnd: days(30) })
    await repo.subscriptions.upsertFromStripe({ ...base, status: 'canceled', interval: 'month' as const, currentPeriodEnd: days(-1) })
    const subs = await repo.subscriptions.listActive('u')
    expect(subs).toHaveLength(1)
    expect(resolvePlan(subs, 'remy', now)).toBe('free')
  })

  it('un abonnement payant efface le bandeau de la semaine d’accueil', async () => {
    const { repo } = createMemoryRepo()
    await repo.subscriptions.startTrial('u', 'flowear', new Date(days(5)))
    await repo.subscriptions.upsertFromStripe({
      userId: 'u',
      appSlug: 'remy',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_1',
      status: 'active',
      interval: 'month' as const, currentPeriodEnd: days(30),
    })
    const subs = await repo.subscriptions.listActive('u')
    expect(resolveAccess(subs, 'remy', now)).toMatchObject({ plan: 'paid', trialEndsAt: null })
  })

  it('un événement n’est traité qu’une fois, et redevient neuf après un échec', async () => {
    const { repo } = createMemoryRepo()
    expect(await repo.stripeEvents.markProcessed('evt_1', 'customer.subscription.updated')).toBe(true)
    expect(await repo.stripeEvents.markProcessed('evt_1', 'customer.subscription.updated')).toBe(false)
    await repo.stripeEvents.forget('evt_1')
    expect(await repo.stripeEvents.markProcessed('evt_1', 'customer.subscription.updated')).toBe(true)
  })

  it('le client Stripe est mémorisé sur la personne', async () => {
    const { repo } = createMemoryRepo()
    await repo.users.upsert({ clerkUserId: 'u', email: 'u@x.test' })
    expect((await repo.users.get('u'))?.stripeCustomerId).toBeNull()
    await repo.users.setStripeCustomerId('u', 'cus_9')
    expect((await repo.users.get('u'))?.stripeCustomerId).toBe('cus_9')
    // Une mise à jour d'email ne perd pas le client Stripe.
    await repo.users.upsert({ clerkUserId: 'u', email: 'autre@x.test' })
    expect((await repo.users.get('u'))?.stripeCustomerId).toBe('cus_9')
  })
})
