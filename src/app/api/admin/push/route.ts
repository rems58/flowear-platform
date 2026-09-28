import type { NextRequest } from 'next/server'
import { ADMIN_PUSH_SLUG } from '@/core/admin/constants'
import { DEFAULTS } from '@/core/config/defaults'
import { pushSubscriptionSchema, pushUnsubscribeSchema } from '@/core/push/subscription'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { isPushConfigured } from '@/lib/env'

/**
 * Notifications de l'admin : même abonnement que pour une IA, sur le slug réservé.
 * Réservée aux administrateurs, sinon n'importe qui pourrait recevoir les signalements.
 */
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await requireUser()
  requireAdmin(userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'admin.push.subscribe' })
  if (!isPushConfigured()) throw AppError.badRequest('Notifications indisponibles')
  const body = await readJson(req, pushSubscriptionSchema, 8_000)
  await getRepo().push.save({ userId, appSlug: ADMIN_PUSH_SLUG, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, locale: 'fr' })
  return json({ enabled: true })
}, 'admin.push.subscribe')

export const DELETE = withRoute(async (req: NextRequest) => {
  const userId = await requireUser()
  requireAdmin(userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'admin.push.unsubscribe' })
  const body = await readJson(req, pushUnsubscribeSchema, 8_000)
  await getRepo().push.remove(userId, ADMIN_PUSH_SLUG, body.endpoint)
  return json({ enabled: false })
}, 'admin.push.unsubscribe')
