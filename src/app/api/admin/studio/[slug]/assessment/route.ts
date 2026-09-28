import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { isSafeSlug } from '@/core/security/sanitize'
import { flowearAssessmentsSchema } from '@/core/studio/review'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/**
 * PUT : Flowear pose dans le brouillon d'un créateur le questionnaire qu'il a décrit en mots.
 * Schéma strict (source obligatoire), `null` le retire. Journalisé avant d'écrire.
 */
export const PUT = withRoute<{ slug: string }>(async (req: NextRequest, ctx) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.studio.assessment' })
  const { slug } = await ctx.params
  if (!isSafeSlug(slug)) throw AppError.notFound('IA introuvable')
  const { assessments } = await readJson(req, z.object({ assessments: flowearAssessmentsSchema.nullable() }), 60_000)
  const repo = getRepo()
  if (!(await repo.creatorApps.get(slug))) throw AppError.notFound('IA introuvable')
  await repo.audit.require({ userId: adminId, action: 'creator_assessment', details: { slug, count: assessments?.length ?? 0 }, ip })
  await repo.creatorApps.setAssessments(slug, assessments ?? undefined)
  await repo.creatorEvents.log({ slug, actorId: adminId, action: 'assessment_built', details: { count: assessments?.length ?? 0 } })
  return json({ ok: true })
}, 'admin.studio.assessment')
