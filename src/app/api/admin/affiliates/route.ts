import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { affiliateCodeSchema, DEFAULT_PAYOUT_EUR } from '@/core/growth/affiliates'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

const createSchema = z.object({
  code: affiliateCodeSchema,
  name: z.string().trim().min(1).max(80),
  contact: z.string().trim().max(120).optional(),
  payoutEur: z.number().min(0).max(100).default(DEFAULT_PAYOUT_EUR),
  percent: z.number().min(0).max(100).nullable().default(null),
  months: z.number().int().min(1).max(120).nullable().default(null),
  /** Limité à une IA : le créateur Studio qui partage son propre lien. */
  appSlug: z.string().regex(/^[a-z0-9-]{2,32}$/).nullable().default(null),
})
const removeSchema = z.object({ code: affiliateCodeSchema })

/** Crée un créateur affilié : son code devient un lien `?ref=<code>`. */
export const POST = withRoute(async (req: NextRequest) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.affiliates' })
  const input = await readJson(req, createSchema, 4_000)
  const repo = getRepo()
  if ((await repo.affiliates.list()).some((a) => a.code === input.code)) throw AppError.badRequest('Ce code existe déjà.')
  await repo.audit.require({ userId: adminId, action: 'affiliate_create', details: { code: input.code }, ip })
  const affiliate = await repo.affiliates.create({ code: input.code, name: input.name, contact: input.contact || null, payoutEur: input.payoutEur, percent: input.percent, months: input.percent === null ? null : input.months, appSlug: input.appSlug })
  return json({ ok: true, affiliate })
}, 'admin.affiliates')

export const DELETE = withRoute(async (req: NextRequest) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.affiliates' })
  const { code } = await readJson(req, removeSchema, 1_000)
  const repo = getRepo()
  await repo.audit.require({ userId: adminId, action: 'affiliate_remove', details: { code }, ip })
  await repo.affiliates.remove(code)
  return json({ ok: true })
}, 'admin.affiliates')
