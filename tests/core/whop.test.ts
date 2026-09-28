import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { resolveAccess } from '@/core/billing/entitlements'
import { appSlugForWhopProduct, applyWhopMembership, attachPendingWhopMemberships, parseWhopMembership, parseWhopProducts, verifyWhopSignature, whopStatusToOurs } from '@/core/billing/whop'

const SECRET = 'ws_test_secret'
const now = new Date('2026-09-21T12:00:00Z')

function sign(body: string, id = 'msg_1', ts = String(Math.floor(now.getTime() / 1000))) {
  const sig = createHmac('sha256', SECRET).update(`${id}.${ts}.${body}`).digest('base64')
  return { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` }
}

const activated = {
  id: 'msg_1',
  type: 'membership.activated',
  api_version: 'v1',
  timestamp: now.toISOString(),
  account_id: 'biz_x',
  data: {
    id: 'mem_1',
    status: 'active',
    user: { id: 'user_w1', username: 'lea', email: 'Lea@Example.com' },
    product: { id: 'prod_amorce', title: 'Amorce Pro' },
    plan: { id: 'plan_m' },
    renewal_period_end: '2026-10-21T12:00:00Z',
    metadata: {},
  },
}

describe('Whop : signature, lecture, droits', () => {
  it('accepte une signature valide et refuse le reste', () => {
    const body = JSON.stringify(activated)
    expect(verifyWhopSignature(sign(body), body, SECRET, now)).toBe(true)
    expect(verifyWhopSignature(sign(body), body + ' ', SECRET, now)).toBe(false)
    expect(verifyWhopSignature(sign(body), body, 'ws_autre', now)).toBe(false)
    const old = sign(body, 'msg_2', String(Math.floor(now.getTime() / 1000) - 600))
    expect(verifyWhopSignature(old, body, SECRET, now)).toBe(false)
    expect(verifyWhopSignature({}, body, SECRET, now)).toBe(false)
  })

  it('lit un événement membership et le traduit dans nos statuts', () => {
    const m = parseWhopMembership(activated)
    expect(m).toEqual({
      membershipId: 'mem_1',
      whopUserId: 'user_w1',
      email: 'lea@example.com',
      productId: 'prod_amorce',
      planId: 'plan_m',
      status: 'active',
      renewalPeriodEnd: '2026-10-21T12:00:00Z',
    })
    expect(whopStatusToOurs('trialing')).toBe('trialing')
    expect(whopStatusToOurs('past_due')).toBe('past_due')
    expect(whopStatusToOurs('canceled')).toBe('canceled')
    expect(whopStatusToOurs('expired')).toBe('canceled')
    expect(parseWhopMembership({ type: 'payment.succeeded', data: {} })).toBeNull()
  })

  it('associe un produit Whop à une IA par la variable WHOP_PRODUCTS', () => {
    const map = parseWhopProducts('prod_amorce=amorce, prod_all=flowear')
    expect(appSlugForWhopProduct(map, 'prod_amorce')).toBe('amorce')
    expect(appSlugForWhopProduct(map, 'prod_all')).toBe('flowear')
    expect(appSlugForWhopProduct(map, 'prod_inconnu')).toBeNull()
  })

  it('ouvre le Pro à la personne dont l’email correspond, et le ferme à la désactivation', async () => {
    const { repo } = createMemoryRepo()
    await repo.users.upsert({ clerkUserId: 'u1', email: 'lea@example.com' })
    const m = parseWhopMembership(activated)!
    expect(await applyWhopMembership(repo, m, 'amorce')).toBe('attached')
    expect(resolveAccess(await repo.subscriptions.listActive('u1'), 'amorce', now).plan).toBe('paid')

    const deactivated = parseWhopMembership({ ...activated, type: 'membership.deactivated', data: { ...activated.data, status: 'canceled' } })!
    expect(await applyWhopMembership(repo, deactivated, 'amorce')).toBe('attached')
    expect(resolveAccess(await repo.subscriptions.listActive('u1'), 'amorce', now).plan).toBe('free')
  })

  it('garde en attente un achat dont l’email n’a pas encore de compte, puis le rattache à l’inscription', async () => {
    const { repo } = createMemoryRepo()
    const m = parseWhopMembership(activated)!
    expect(await applyWhopMembership(repo, m, 'amorce')).toBe('pending')
    await repo.users.upsert({ clerkUserId: 'u9', email: 'lea@example.com' })
    expect(await attachPendingWhopMemberships(repo, 'u9', 'lea@example.com')).toBe(1)
    expect(resolveAccess(await repo.subscriptions.listActive('u9'), 'amorce', now).plan).toBe('paid')
    expect(await attachPendingWhopMemberships(repo, 'u9', 'lea@example.com')).toBe(0)
  })
})
