import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { clientIp, rateLimitOrThrow } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { verifyUnsubscribeToken } from '@/lib/digest/token'
import { getServerEnv } from '@/lib/env'
import { getLocale } from '@/lib/i18n/server'
import { getMessages } from '@/lib/i18n/messages'

const schema = z.object({ u: z.string().min(1).max(80), t: z.string().regex(/^[a-f0-9]{64}$/) })

/** GET ?u=<id>&t=<jeton> : désactive le digest. Lien signé, pas de session nécessaire. */
export async function GET(req: NextRequest): Promise<Response> {
  const ip = clientIp(req)
  try {
    await rateLimitOrThrow(`digest:unsub:${ip}`, 20, 60_000, { ip, route: 'digest.unsubscribe' })
  } catch {
    return new NextResponse('Too many requests', { status: 429 })
  }
  if (!getServerEnv().CRON_SECRET) return new NextResponse('Not configured', { status: 503 })
  const parsed = schema.safeParse({ u: req.nextUrl.searchParams.get('u'), t: req.nextUrl.searchParams.get('t') })
  if (!parsed.success || !verifyUnsubscribeToken(parsed.data.u, parsed.data.t)) return new NextResponse('Invalid link', { status: 400 })
  await getRepo().users.setDigest(parsed.data.u, false)
  const t = getMessages(await getLocale())
  return new NextResponse(t.digest.unsubscribed, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
