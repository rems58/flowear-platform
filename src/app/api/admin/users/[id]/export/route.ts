import type { NextRequest } from 'next/server'
import { DEFAULTS } from '@/core/config/defaults'
import { AppError } from '@/lib/api/errors'
import { clientIp, rateLimitOrThrow, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/**
 * Portabilité (RGPD) : tout ce que la base sait d'une personne, en un fichier JSON.
 * Un export est une lecture complète : il est journalisé comme une ouverture de conversation.
 */
export const GET = withRoute<{ id: string }>(async (req: NextRequest, ctx) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.export' })
  const { id } = await ctx.params
  const userId = decodeURIComponent(id)
  const repo = getRepo()
  await repo.audit.require({ userId: adminId, action: 'user_export', details: { target: userId }, ip })
  const data = await repo.users.exportAll(userId)
  if (!data) throw AppError.notFound('Personne introuvable')
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="flowear-${stamp}.json"`,
      'cache-control': 'no-store',
    },
  })
}, 'admin.export')
