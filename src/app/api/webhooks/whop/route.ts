import { NextResponse, type NextRequest } from 'next/server'
import { appSlugForWhopProduct, applyWhopMembership, parseWhopMembership, parseWhopProducts, verifyWhopSignature } from '@/core/billing/whop'
import { clientIp, rateLimitOrThrow } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { getServerEnv } from '@/lib/env'

/**
 * Webhook Whop : signature vérifiée sur le corps brut, chaque événement traité une seule fois
 * (même table d'idempotence que Stripe, préfixe `whop:`), puis l'adhésion ouvre ou ferme le Pro.
 * Un produit inconnu de `WHOP_PRODUCTS` est ignoré et journalisé : jamais de droit ouvert au hasard.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const ip = clientIp(req)
  try {
    await rateLimitOrThrow(`webhook:whop:${ip}`, 300, 60_000, { ip, route: 'webhooks.whop' })
  } catch {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const env = getServerEnv()
  if (!env.WHOP_WEBHOOK_SECRET) return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })

  const raw = await req.text()
  const repo = getRepo()
  if (!verifyWhopSignature(req.headers, raw, env.WHOP_WEBHOOK_SECRET)) {
    await repo.audit.log({ action: 'webhook_signature_invalid', details: { source: 'whop' }, ip })
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  let event: { id?: string; type?: string }
  try {
    event = JSON.parse(raw) as { id?: string; type?: string }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const eventId = event.id ?? req.headers.get('webhook-id')
  if (!eventId || !event.type) return NextResponse.json({ error: 'invalid_event' }, { status: 400 })
  if (!(await repo.stripeEvents.markProcessed(`whop:${eventId}`, `whop:${event.type}`))) {
    return NextResponse.json({ ok: true, alreadyProcessed: true })
  }

  try {
    const membership = parseWhopMembership(event)
    if (!membership) return NextResponse.json({ ok: true, ignored: event.type })
    const appSlug = appSlugForWhopProduct(parseWhopProducts(env.WHOP_PRODUCTS), membership.productId)
    if (!appSlug) {
      await repo.audit.log({ action: 'whop_unknown_product', details: { productId: membership.productId, membershipId: membership.membershipId }, ip })
      return NextResponse.json({ ok: true, ignored: 'unknown_product' })
    }
    const result = await applyWhopMembership(repo, membership, appSlug)
    await repo.events.track({
      name: membership.status === 'active' || membership.status === 'trialing' ? 'subscribed' : 'churned',
      userId: null,
      appSlug,
      props: { source: 'whop', membershipId: membership.membershipId, status: membership.status, result },
    })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    console.error('[webhooks.whop]', event.type, error)
    // 500 : Whop rejouera (30 s, 2 min, 8 min…). L'événement redevient neuf pour que le rejeu agisse.
    await repo.stripeEvents.forget(`whop:${eventId}`)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}

/** La signature se vérifie sur le corps brut : pas de mise en cache, runtime Node. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
