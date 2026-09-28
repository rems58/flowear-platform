import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { sanitizeText } from '@/core/security/sanitize'
import { AppError } from '@/lib/api/errors'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

const putSchema = z.object({ content: z.string().min(3).max(300) })
const idSchema = z.string().uuid()

/** PUT : corriger un souvenir. Uniquement les siens. */
export const PUT = withRoute<{ app: string; id: string }>(async (req: NextRequest, ctx) => {
  const { app: slug, id } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'memory.put' })
  if (!idSchema.safeParse(id).success) throw AppError.notFound('Souvenir introuvable')
  const body = await readJson(req, putSchema, 4_000)
  const note = await getRepo().notes.update(id, userId, sanitizeText(body.content, 300))
  if (!note) throw AppError.notFound('Souvenir introuvable')
  return json({ id: note.id, content: note.content, source: note.source })
}, 'memory.put')

/** DELETE : oublier un souvenir. */
export const DELETE = withRoute<{ app: string; id: string }>(async (req: NextRequest, ctx) => {
  const { app: slug, id } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'memory.delete' })
  if (!idSchema.safeParse(id).success) throw AppError.notFound('Souvenir introuvable')
  const ok = await getRepo().notes.remove(id, userId)
  if (!ok) throw AppError.notFound('Souvenir introuvable')
  return json({ ok: true })
}, 'memory.delete')
