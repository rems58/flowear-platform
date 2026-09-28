import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { pick, isLocale, DEFAULT_LOCALE } from '@/core/i18n/locale'
import { buildNudge, serializePayload, shouldNudge } from '@/core/push/nudge'
import { clientIp, rateLimitOrThrow } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { getServerEnv, isPushConfigured } from '@/lib/env'
import { getMessages } from '@/lib/i18n/messages'
import { sendPush } from '@/lib/push/send'

/** Comparaison en temps constant : un secret ne se compare jamais caractère par caractère. */
function bearerMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header ?? '')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const WEEK_MS = 7 * 86_400_000
const DAY_MS = 86_400_000
const BATCH = 200
const MAX_PAGES = 25

export const maxDuration = 300

/**
 * Relance hebdomadaire par notification (Vercel Cron, jeudi 17h UTC). Protégée par CRON_SECRET.
 *
 * Un navigateur reçoit au plus une relance par semaine, et seulement si la personne s'est
 * éloignée sans être partie (voir `shouldNudge`). Le jour est volontairement différent de
 * celui du digest : personne ne reçoit un email et une notification le même matin.
 *
 * Sans clés VAPID : rien ne part, rien ne casse.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const env = getServerEnv()
  const ip = clientIp(req)
  try {
    await rateLimitOrThrow(`cron:push:${ip}`, 10, 60_000, { ip, route: 'cron.push' })
  } catch {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  if (!env.CRON_SECRET) return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 })
  if (!bearerMatches(req.headers.get('authorization'), env.CRON_SECRET)) {
    await getRepo().audit.log({ action: 'denied_401', details: { route: 'cron.push' }, ip })
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isPushConfigured(env)) return NextResponse.json({ ok: true, skipped: 'push_not_configured' })

  await ensureAppsLoaded()
  const repo = getRepo()
  const now = new Date()
  const before = new Date(now.getTime() - 6 * DAY_MS)
  const since = new Date(now.getTime() - WEEK_MS)
  let examined = 0
  let sent = 0
  let skipped = 0
  let expired = 0
  let failed = 0
  // Chaque abonnement examiné sort de la sélection (il est marqué), la page suivante en
  // apporte d'autres. Un échec passager n'est pas marqué : il sera repris la semaine d'après.
  const failedIds = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = (await repo.push.listDue(before, BATCH)).filter((s) => !failedIds.has(s.id))
    if (batch.length === 0) break
    examined += batch.length
    for (const subscription of batch) {
      try {
        const app = getApp(subscription.appSlug)
        const profile = app ? await repo.profiles.get(subscription.userId, subscription.appSlug) : null
        // IA retirée du registre, ou onboarding jamais terminé : rien à rappeler.
        if (!app || !profile || profile.status !== 'active') {
          await repo.push.markNudged(subscription.id, now)
          skipped++
          continue
        }
        const lastMessageAt = await repo.usage.lastMessageAt(subscription.userId, subscription.appSlug)
        const idleDays = lastMessageAt === null ? Number.POSITIVE_INFINITY : Math.floor((now.getTime() - lastMessageAt.getTime()) / DAY_MS)
        if (!shouldNudge({ idleDays })) {
          await repo.push.markNudged(subscription.id, now)
          skipped++
          continue
        }
        const locale = isLocale(subscription.locale) ? subscription.locale : DEFAULT_LOCALE
        const [notes, artifacts] = await Promise.all([
          repo.notes.countSince(subscription.userId, subscription.appSlug, since),
          repo.artifacts.countSince(subscription.userId, subscription.appSlug, since),
        ])
        const payload = buildNudge(
          {
            appSlug: app.slug,
            appName: pick(app.name, locale),
            firstName: typeof profile.data.firstName === 'string' ? profile.data.firstName : null,
            notes,
            artifacts,
            idleDays,
          },
          getMessages(locale)
        )
        const result = await sendPush(subscription, serializePayload(payload))
        if (result === 'expired') {
          // Le navigateur a révoqué l'abonnement : la ligne ne sert plus à rien.
          await repo.push.removeExpired(subscription.endpoint)
          expired++
          continue
        }
        await repo.push.markNudged(subscription.id, now)
        if (result === 'sent') {
          sent++
          await repo.events.track({ name: 'push_sent', userId: subscription.userId, appSlug: app.slug, props: { idleDays, notes, artifacts } })
        } else {
          skipped++
        }
      } catch (error) {
        console.error('[cron.push]', subscription.id, error instanceof Error ? error.message : error)
        failedIds.add(subscription.id)
        failed++
      }
    }
    if (batch.length < BATCH) break
  }
  return NextResponse.json({ ok: true, examined, sent, skipped, expired, failed })
}
