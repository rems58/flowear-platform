import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { NextResponse, type NextRequest } from 'next/server'
import { clientIp, rateLimitOrThrow } from '@/lib/api/guard'
import { attachPendingWhopMemberships } from '@/core/billing/whop'
import { getRepo } from '@/lib/db/repo'
import { getServerEnv } from '@/lib/env'

/**
 * Webhook Clerk : miroir des utilisateurs. Signature vérifiée (svix) avant toute
 * lecture ; un événement invalide est refusé en 400 sans détail.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const ip = clientIp(req)
  try {
    await rateLimitOrThrow(`webhook:clerk:${ip}`, 120, 60_000, { ip, route: 'webhooks.clerk' })
  } catch {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const env = getServerEnv()
  if (!env.CLERK_WEBHOOK_SIGNING_SECRET) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })
  }

  let event
  try {
    event = await verifyWebhook(req, { signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET })
  } catch {
    await getRepo().audit.log({ action: 'webhook_signature_invalid', details: { source: 'clerk' }, ip })
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  const repo = getRepo()
  try {
    switch (event.type) {
      case 'user.created':
      case 'user.updated': {
        const data = event.data
        const primary = data.email_addresses?.find((e) => e.id === data.primary_email_address_id) ?? data.email_addresses?.[0]
        await repo.users.upsert({ clerkUserId: data.id, email: primary?.email_address ?? null })
        // Un achat Whop fait avant l'inscription attend cet email : il ouvre le Pro maintenant.
        if (primary?.email_address) await attachPendingWhopMemberships(repo, data.id, primary.email_address)
        if (event.type === 'user.created') {
          await repo.events.track({ name: 'signup', userId: data.id, props: { source: 'clerk' } })
        }
        break
      }
      case 'user.deleted': {
        if (event.data.id) await repo.users.markDeleted(event.data.id)
        break
      }
      default:
        break
    }
  } catch (error) {
    console.error('[webhooks.clerk]', error)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
