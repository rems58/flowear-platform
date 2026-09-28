import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { buildProfileSchema } from '@/apps/types'
import { BUNDLE_SLUG } from '@/core/billing/entitlements'
import { DEFAULTS } from '@/core/config/defaults'
import { resolveConfig } from '@/core/config/resolve'
import { AppError } from '@/lib/api/errors'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireUser, withRoute, requireAppAccess } from '@/lib/api/guard'
import { readUtmCookie } from '@/lib/analytics/utm-cookie'
import { getRepo } from '@/lib/db/repo'
import { resolveQuestion } from '@/apps/types'
import { getLocale } from '@/lib/i18n/server'

const putSchema = z.object({
  answers: z.record(z.string().max(40), z.unknown()),
})

/** GET : profil de l'utilisateur pour cette IA (jamais celui d'un autre). */
export const GET = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'profile.get' })
  const [profile, locale] = await Promise.all([getRepo().profiles.get(userId, app.slug), getLocale(userId)])
  return json({
    status: profile?.status ?? 'onboarding',
    data: profile?.data ?? {},
    questions: app.onboarding.questions.map((q) => resolveQuestion(q, locale)),
  })
}, 'profile.get')

/** PUT : réponses d'onboarding, validées contre le schéma dérivé du manifeste. */
export const PUT = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'profile.put' })

  const body = await readJson(req, putSchema, 32_000)
  const parsed = buildProfileSchema(app.onboarding.questions).safeParse(body.answers)
  if (!parsed.success) {
    throw AppError.badRequest('Réponses invalides', {
      issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }

  const repo = getRepo()
  const existing = await repo.profiles.get(userId, app.slug)
  const merged = { ...(existing?.data ?? {}), ...parsed.data }
  const profile = await repo.profiles.upsert(userId, app.slug, merged, 'active')
  // La langue résolue (cookie, compte, navigateur) devient la préférence du compte.
  const locale = await getLocale(userId)
  await repo.users.upsert({ clerkUserId: userId, locale })
  if (!existing || existing.status !== 'active') {
    await repo.events.track({ name: 'onboarding_done', userId, appSlug: app.slug, props: { locale }, utm: await readUtmCookie() })
    // Semaine d'accueil : tout le plan payant sur toutes les IA, sans carte, une seule fois par compte
    // (ligne `trialing` sur le bundle). Un deuxième onboarding sur une autre IA n'en rouvre pas.
    const days = resolveConfig(app, await repo.appSettings.list()).trial.days
    if (days > 0) {
      const endsAt = new Date(Date.now() + days * 86_400_000)
      const started = await repo.subscriptions.startTrial(userId, BUNDLE_SLUG, endsAt)
      if (started) await repo.events.track({ name: 'trial_started', userId, appSlug: app.slug, props: { days, endsAt: endsAt.toISOString(), scope: BUNDLE_SLUG } })
    }
  }
  return json({ status: profile.status, data: profile.data })
}, 'profile.put')
