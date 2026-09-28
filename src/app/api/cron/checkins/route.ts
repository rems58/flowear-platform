import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { runCheckins } from '@/core/checkins/run'
import { pick } from '@/core/i18n/locale'
import { serializePayload } from '@/core/push/nudge'
import { clientIp, rateLimitOrThrow } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { getServerEnv, isPushConfigured } from '@/lib/env'
import { sendPush } from '@/lib/push/send'

function bearerMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header ?? '')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export const maxDuration = 120

/**
 * Rappels programmés (Vercel Cron, toutes les quinze minutes). Protégée par CRON_SECRET.
 * Chaque rappel dont l'heure locale est arrivée part par notification et avance au
 * passage suivant. Sans clés VAPID : rien ne part, rien ne casse.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const env = getServerEnv()
  const ip = clientIp(req)
  try {
    await rateLimitOrThrow(`cron:checkins:${ip}`, 20, 60_000, { ip, route: 'cron.checkins' })
  } catch {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  if (!env.CRON_SECRET) return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 })
  if (!bearerMatches(req.headers.get('authorization'), env.CRON_SECRET)) {
    await getRepo().audit.log({ action: 'denied_401', details: { route: 'cron.checkins' }, ip })
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isPushConfigured(env)) return NextResponse.json({ ok: true, skipped: 'push_not_configured' })

  await ensureAppsLoaded()
  const result = await runCheckins({
    repo: getRepo(),
    now: () => new Date(),
    send: sendPush,
    serialize: serializePayload,
    // Le nom de l'IA est le titre : la langue de la personne n'est pas relue, le message a déjà été écrit dans la sienne.
    appName: (slug) => {
      const app = getApp(slug)
      return app ? pick(app.name, 'en') : null
    },
    log: (message, details) => console.error('[cron.checkins]', message, details),
  })
  return NextResponse.json({ ok: true, ...result })
}
