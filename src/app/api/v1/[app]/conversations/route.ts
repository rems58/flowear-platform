import type { NextRequest } from 'next/server'
import { DEFAULTS } from '@/core/config/defaults'
import { clientIp, getAppOr404, json, rateLimitOrThrow, requireUser, withRoute, requireAppAccess } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** GET : conversations de l'utilisateur pour cette IA. */
export const GET = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'conversations.list' })
  const conversations = await getRepo().conversations.list(userId, app.slug, 30)
  return json({ conversations })
}, 'conversations.list')
