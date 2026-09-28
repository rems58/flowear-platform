import type { NextRequest } from 'next/server'
import { DEFAULTS } from '@/core/config/defaults'
import { buildGuide } from '@/core/help/guide'
import { clientIp, getAppOr404, json, rateLimitOrThrow, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getLocale } from '@/lib/i18n/server'

/** GET : le guide de l'IA (tout ce que la personne peut faire), dans sa langue. */
export const GET = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'guide' })
  return json(buildGuide(app, await getLocale(userId)))
}, 'guide')
