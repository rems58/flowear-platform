import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Repo } from '@/core/data/repo'

/**
 * Whop : deuxième caisse à côté de Stripe (décision du 21 septembre 2026). Une fiche par IA sur la
 * marketplace, un programme d'affiliation intégré, et Whop encaisse. Nous ne recevons que des
 * webhooks `membership.*` : une adhésion active ouvre le Pro, une adhésion fermée le retire.
 * La personne est reconnue par l'email de son compte Whop ; sans compte Flowear à cet email,
 * l'adhésion attend et se rattache à l'inscription (webhook Clerk).
 */

/** Fenêtre de validité d'un horodatage de webhook, contre le rejeu. */
const MAX_SKEW_MS = 5 * 60_000

export interface WhopMembership {
  membershipId: string
  whopUserId: string | null
  email: string | null
  productId: string | null
  planId: string | null
  /** Statut Whop brut : active, trialing, past_due, canceled, expired, completed… */
  status: string
  renewalPeriodEnd: string | null
}

type HeaderBag = Record<string, string | null | undefined> | { get(name: string): string | null }

function header(headers: HeaderBag, name: string): string | null {
  if (typeof (headers as { get?: unknown }).get === 'function') return (headers as { get(n: string): string | null }).get(name)
  return (headers as Record<string, string | null | undefined>)[name] ?? null
}

/**
 * Signature « Standard Webhooks » : HMAC-SHA256 de `{id}.{timestamp}.{corps brut}` avec le secret
 * `ws_…`, en base64, dans `webhook-signature` sous la forme `v1,<sig>` (plusieurs valeurs possibles,
 * séparées par des espaces, lors d'une rotation de secret).
 */
export function verifyWhopSignature(headers: HeaderBag, rawBody: string, secret: string, now = new Date()): boolean {
  const id = header(headers, 'webhook-id')
  const ts = header(headers, 'webhook-timestamp')
  const sigHeader = header(headers, 'webhook-signature')
  if (!id || !ts || !sigHeader) return false
  const seconds = Number(ts)
  if (!Number.isFinite(seconds) || Math.abs(now.getTime() - seconds * 1000) > MAX_SKEW_MS) return false
  const expected = createHmac('sha256', secret).update(`${id}.${ts}.${rawBody}`).digest()
  return sigHeader.split(' ').some((part) => {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) return false
    const given = Buffer.from(value, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

/** Statut Whop → statut de notre table `subscriptions` (mêmes mots que Stripe). */
export function whopStatusToOurs(status: string): 'active' | 'trialing' | 'past_due' | 'canceled' {
  switch (status) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    default:
      return 'canceled'
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Lit un événement `membership.*` ; `null` pour tout autre type ou un corps sans identifiant. */
export function parseWhopMembership(event: unknown): WhopMembership | null {
  if (!event || typeof event !== 'object') return null
  const { type, data } = event as { type?: unknown; data?: Record<string, unknown> }
  if (typeof type !== 'string' || !type.startsWith('membership.') || !data || typeof data !== 'object') return null
  const membershipId = str(data.id)
  if (!membershipId) return null
  const user = (data.user ?? {}) as Record<string, unknown>
  const product = (data.product ?? {}) as Record<string, unknown>
  const plan = (data.plan ?? {}) as Record<string, unknown>
  return {
    membershipId,
    whopUserId: str(user.id),
    email: str(user.email)?.toLowerCase() ?? null,
    productId: str(product.id) ?? str(data.product_id),
    planId: str(plan.id) ?? str(data.plan_id),
    status: str(data.status) ?? 'unknown',
    renewalPeriodEnd: str(data.renewal_period_end),
  }
}

/** `WHOP_PRODUCTS="prod_x=amorce, prod_y=flowear"` → correspondance produit Whop → IA (ou bundle). */
export function parseWhopProducts(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>()
  for (const pair of (raw ?? '').split(',')) {
    const [product, slug] = pair.split('=').map((s) => s.trim())
    if (product && slug) map.set(product, slug)
  }
  return map
}

export function appSlugForWhopProduct(map: Map<string, string>, productId: string | null): string | null {
  return productId ? (map.get(productId) ?? null) : null
}

/**
 * Applique une adhésion : la ligne `whop_memberships` est toujours écrite (mémoire du webhook) ;
 * si une personne porte cet email, sa ligne `subscriptions` est créée ou mise à jour. Sinon
 * l'adhésion reste en attente jusqu'à l'inscription.
 */
export async function applyWhopMembership(repo: Repo, m: WhopMembership, appSlug: string): Promise<'attached' | 'pending'> {
  const user = m.email ? await repo.users.getByEmail(m.email) : null
  await repo.whopMemberships.upsert({ ...m, appSlug, userId: user?.clerkUserId ?? null })
  if (!user) return 'pending'
  await repo.subscriptions.upsertFromWhop({
    userId: user.clerkUserId,
    appSlug,
    whopMembershipId: m.membershipId,
    status: whopStatusToOurs(m.status),
    currentPeriodEnd: m.renewalPeriodEnd,
  })
  return 'attached'
}

/** À l'inscription : rattache les adhésions Whop en attente sur cet email. Renvoie le nombre rattaché. */
export async function attachPendingWhopMemberships(repo: Repo, clerkUserId: string, email: string): Promise<number> {
  const pending = await repo.whopMemberships.listPendingByEmail(email.toLowerCase())
  for (const m of pending) {
    await repo.subscriptions.upsertFromWhop({
      userId: clerkUserId,
      appSlug: m.appSlug,
      whopMembershipId: m.membershipId,
      status: whopStatusToOurs(m.status),
      currentPeriodEnd: m.renewalPeriodEnd,
    })
    await repo.whopMemberships.attach(m.membershipId, clerkUserId)
  }
  return pending.length
}
