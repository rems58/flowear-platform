import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolvePlan } from '@/core/billing/entitlements'
import { DEFAULTS } from '@/core/config/defaults'
import { clientIp, getAppOr404, isAdmin, json, rateLimitOrThrow, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

const typeSchema = z.enum(['fiche', 'comparatif'])

/** Nombre de productions visibles dans le panneau sur le plan gratuit ; le reste se débloque avec l'abonnement. */
export const FREE_PANEL_LIMIT = 3

/**
 * GET ?type=fiche : les productions de l'utilisateur pour cette IA, avec leur contenu.
 * Plan gratuit : les trois plus récentes, et le nombre de celles qui attendent l'abonnement.
 * Rien n'est supprimé : elles restent lisibles dans les conversations et reviennent avec l'abonnement.
 */
export const GET = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'artifacts.list' })
  const type = typeSchema.safeParse(req.nextUrl.searchParams.get('type'))
  const repo = getRepo()
  const [all, subscriptions] = await Promise.all([repo.artifacts.list(userId, app.slug, 100), repo.subscriptions.listActive(userId)])
  const plan = isAdmin(userId) ? 'paid' : resolvePlan(subscriptions, app.slug)
  const filtered = type.success ? all.filter((a) => a.type === type.data) : all
  const visible = plan === 'free' ? filtered.slice(0, FREE_PANEL_LIMIT) : filtered
  const items = visible.map((a) => ({ id: a.id, type: a.type, title: a.title, data: a.data, createdAt: a.createdAt }))
  return json({ artifacts: items, locked: filtered.length - visible.length, plan })
}, 'artifacts.list')
