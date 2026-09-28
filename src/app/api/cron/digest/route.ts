import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { listApps } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { buildDigest, isEmptyDigest } from '@/core/digest/build'
import { renderDigest } from '@/core/digest/render'
import { isLocale, DEFAULT_LOCALE } from '@/core/i18n/locale'
import { purgeDeletedUsers } from '@/core/privacy/purge'
import { clientIp, rateLimitOrThrow } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { unsubscribeToken } from '@/lib/digest/token'
import { sendEmail } from '@/lib/email/resend'
import { getServerEnv } from '@/lib/env'
import { getMessages } from '@/lib/i18n/messages'

/** Comparaison en temps constant : un secret ne se compare jamais caractère par caractère. */
function bearerMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header ?? '')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const WEEK_MS = 7 * 86_400_000
const BATCH = 200
const MAX_PAGES = 25

/** Vercel : le lot peut dépasser la limite par défaut d'une fonction. */
export const maxDuration = 300

/**
 * Digest hebdomadaire (Vercel Cron, lundi 8h UTC). Protégé par CRON_SECRET.
 * Une personne reçoit au plus un email par semaine, uniquement si une IA a retenu
 * ou produit quelque chose pour elle. Sans Resend configuré : rien ne part, rien ne casse.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const env = getServerEnv()
  const ip = clientIp(req)
  try {
    await rateLimitOrThrow(`cron:digest:${ip}`, 10, 60_000, { ip, route: 'cron.digest' })
  } catch {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  if (!env.CRON_SECRET) return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 })
  if (!bearerMatches(req.headers.get('authorization'), env.CRON_SECRET)) {
    await getRepo().audit.log({ action: 'denied_401', details: { route: 'cron.digest' }, ip })
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const repo = getRepo()
  const now = new Date()
  // Même passage hebdomadaire : les comptes supprimés depuis plus de trente jours sont effacés
  // (le plan Vercel limite le nombre de crons, et la promesse est « sous trente jours »).
  const purge = await purgeDeletedUsers(repo, now)
  const since = new Date(now.getTime() - WEEK_MS)
  await ensureAppsLoaded()
  const apps = listApps()
  const before = new Date(now.getTime() - 6 * 86_400_000)
  let candidates = 0
  let sent = 0
  let skipped = 0
  let failed = 0
  // Pages successives : une personne servie (ou sans contenu) sort de la sélection, les autres avancent.
  // Un échec d'envoi ne marque rien : la personne est reprise à la page suivante ou la semaine d'après.
  const failedIds = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = (await repo.users.listDigestCandidates(before, BATCH)).filter((u) => !failedIds.has(u.clerkUserId))
    if (batch.length === 0) break
    candidates += batch.length
    for (const user of batch) {
      if (!user.email) {
        failedIds.add(user.clerkUserId)
        continue
      }
      const locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE
      try {
        const digest = await buildDigest(repo, user.clerkUserId, apps, locale, since)
        if (isEmptyDigest(digest)) {
          await repo.users.markDigestSent(user.clerkUserId, now)
          skipped++
          continue
        }
        const unsubscribeUrl = `${env.NEXT_PUBLIC_APP_URL}/api/digest/unsubscribe?u=${encodeURIComponent(user.clerkUserId)}&t=${unsubscribeToken(user.clerkUserId)}`
        const mail = renderDigest(digest, getMessages(locale), { appUrl: env.NEXT_PUBLIC_APP_URL, unsubscribeUrl })
        const status = await sendEmail({ to: user.email, ...mail })
        if (status === 'sent') {
          await repo.users.markDigestSent(user.clerkUserId, now)
          sent++
          await repo.events.track({ name: 'digest_sent', userId: user.clerkUserId, props: { apps: digest.apps.map((a) => a.slug), notes: digest.totalNotes, artifacts: digest.totalArtifacts } })
        } else {
          // Resend non configuré : rien n'est marqué, le contenu sera envoyé quand la clé existera.
          failedIds.add(user.clerkUserId)
          skipped++
        }
      } catch (error) {
        console.error('[cron.digest]', user.clerkUserId, error instanceof Error ? error.message : error)
        failedIds.add(user.clerkUserId)
        failed++
      }
    }
    if (batch.length < BATCH) break
  }
  return NextResponse.json({ ok: true, candidates, sent, skipped, failed, purge })
}
