import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { AppError } from '@/lib/api/errors'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** Rappels programmés de la personne pour cette IA : ce que le menu affiche. */
export const GET = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'checkins.list' })
  const all = await getRepo().checkins.list(userId, app.slug)
  // Les rappels uniques encore à venir se voient aussi (« dans 2 minutes ») ; le relais du
  // minuteur, lui, reste caché : ce n'est pas un réglage de la personne.
  const now = Date.now()
  return json({
    checkins: all
      .filter((c) => c.kind === 'daily' || (c.timezone !== 'UTC' && new Date(c.nextRunAt).getTime() > now))
      .map((c) => ({ id: c.id, kind: c.kind, timeLocal: c.timeLocal, days: c.days, message: c.message, active: c.active, nextRunAt: c.nextRunAt })),
  })
}, 'checkins.list')

const patchSchema = z.object({ id: z.string().uuid(), active: z.boolean() })

/** Met un rappel en pause, ou le réactive. */
export const PATCH = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'checkins.patch' })
  const body = await readJson(req, patchSchema, 4_000)
  const repo = getRepo()
  const existing = await repo.checkins.get(body.id, userId, app.slug)
  if (!existing) throw AppError.notFound('Rappel introuvable')
  await repo.checkins.setActive(body.id, userId, body.active)
  return json({ id: body.id, active: body.active })
}, 'checkins.patch')

const deleteSchema = z.object({ id: z.string().uuid() })

export const DELETE = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'checkins.delete' })
  const body = await readJson(req, deleteSchema, 4_000)
  const repo = getRepo()
  const existing = await repo.checkins.get(body.id, userId, app.slug)
  if (!existing) throw AppError.notFound('Rappel introuvable')
  await repo.checkins.remove(body.id, userId)
  return json({ removed: true })
}, 'checkins.delete')
