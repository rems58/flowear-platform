import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { isSafeSlug } from '@/core/security/sanitize'
import { hashShareToken, newShareToken } from '@/core/studio/share-token'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

const SITE = 'https://flowear.app'

/**
 * POST : crée (ou régénère) le lien de statistiques d'une IA créateur, ou le révoque. Le jeton
 * n'est renvoyé qu'ici, une fois ; la base n'en garde que l'empreinte. Journalisé avant d'agir.
 */
export const POST = withRoute<{ slug: string }>(async (req: NextRequest, ctx) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.creators.share' })
  const { slug } = await ctx.params
  if (!isSafeSlug(slug)) throw AppError.notFound('IA introuvable')
  const { action } = await readJson(req, z.object({ action: z.enum(['create', 'revoke']) }), 1_000)
  const repo = getRepo()
  if (!(await repo.creatorApps.get(slug))) throw AppError.notFound('IA introuvable')
  await repo.audit.require({ userId: adminId, action: `creator_share_${action}`, details: { slug }, ip })
  if (action === 'revoke') {
    await repo.creatorApps.setShareToken(slug, null)
    return json({ ok: true })
  }
  const token = newShareToken()
  await repo.creatorApps.setShareToken(slug, await hashShareToken(token))
  return json({ ok: true, url: `${SITE}/stats/${token}` })
}, 'admin.creators.share')
