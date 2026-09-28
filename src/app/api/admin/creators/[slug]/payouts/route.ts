import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { isSafeSlug } from '@/core/security/sanitize'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

const payoutSchema = z.object({
  amountCents: z.number().int().min(1).max(10_000_000),
  // Une vraie date du calendrier (le 30 février est refusé ici, pas par Postgres en erreur 500).
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => { const t = new Date(`${d}T00:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d }, 'date invalide'),
  note: z.string().trim().max(300).nullable(),
})

/** POST : enregistre un versement fait à un créateur. Journalisé avant d'écrire. */
export const POST = withRoute<{ slug: string }>(async (req: NextRequest, ctx) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.creators.payouts' })
  const { slug } = await ctx.params
  if (!isSafeSlug(slug)) throw AppError.notFound('IA introuvable')
  const input = await readJson(req, payoutSchema, 2_000)
  const repo = getRepo()
  if (!(await repo.creatorApps.get(slug))) throw AppError.notFound('IA introuvable')
  await repo.audit.require({ userId: adminId, action: 'creator_payout', details: { slug, amountCents: input.amountCents, paidAt: input.paidAt }, ip })
  const payout = await repo.creatorPayouts.create({ slug, amountCents: input.amountCents, paidAt: input.paidAt, note: input.note || null, createdBy: adminId })
  return json({ ok: true, id: payout.id })
}, 'admin.creators.payouts')
