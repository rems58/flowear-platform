import type { NextRequest } from 'next/server'
import { DEFAULTS } from '@/core/config/defaults'
import { isSafeSlug } from '@/core/security/sanitize'
import { toolRequestStatusSchema } from '@/core/studio/economics'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** POST : statut d'une demande d'outil (ouverte, prévue, faite, refusée). Journalisé. */
export const POST = withRoute<{ slug: string }>(async (req: NextRequest, ctx) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.studio.tools' })
  const { slug } = await ctx.params
  if (!isSafeSlug(slug)) throw AppError.notFound('IA introuvable')
  const { id, status } = await readJson(req, toolRequestStatusSchema, 2_000)
  const repo = getRepo()
  if (!(await repo.toolRequests.listBySlug(slug)).some((r) => r.id === id)) throw AppError.notFound('Demande introuvable')
  await repo.audit.require({ userId: adminId, action: 'creator_tool_status', details: { slug, id, status }, ip })
  await repo.toolRequests.setStatus(id, status)
  return json({ ok: true })
}, 'admin.studio.tools')
