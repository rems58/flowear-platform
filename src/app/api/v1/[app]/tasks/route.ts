import type { NextRequest } from 'next/server'
import { DEFAULTS } from '@/core/config/defaults'
import { clientIp, getAppOr404, json, rateLimitOrThrow, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** Toutes les tâches de la personne pour cette IA : le panneau « Tâches ». */
export const GET = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'tasks.list' })
  const tasks = await getRepo().tasks.listAll(userId, app.slug, 200)
  return json({
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, firstAction: t.firstAction, steps: t.steps, energy: t.energy, estimateMin: t.estimateMin, actualMin: t.actualMin, status: t.status, createdAt: t.createdAt, doneAt: t.doneAt })),
  })
}, 'tasks.list')
