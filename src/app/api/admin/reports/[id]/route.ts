import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { reportPatchSchema } from '@/core/reports/schema'
import { sanitizeText } from '@/core/security/sanitize'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** PATCH : l'admin fait avancer un signalement (vu, résolu avec note). Journalisé. */
export const PATCH = withRoute<{ id: string }>(async (req: NextRequest, ctx) => {
  const userId = await requireUser()
  requireAdmin(userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'admin.report' })
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) throw AppError.badRequest('Identifiant invalide')
  const body = await readJson(req, reportPatchSchema, 4_000)
  const repo = getRepo()
  const resolution = body.resolution ? sanitizeText(body.resolution, 1000) : null
  const report = await repo.reports.setStatus(id, body.status, resolution, userId)
  if (!report) throw AppError.notFound('Signalement introuvable')
  await repo.audit.log({ userId, action: 'report_status', details: { id, status: body.status }, ip: clientIp(req) })
  return json(report)
}, 'admin.report')
