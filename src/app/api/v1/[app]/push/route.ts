import type { NextRequest } from 'next/server'
import { DEFAULTS } from '@/core/config/defaults'
import { pushSubscriptionSchema, pushUnsubscribeSchema } from '@/core/push/subscription'
import { AppError } from '@/lib/api/errors'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { isPushConfigured } from '@/lib/env'
import { getLocale } from '@/lib/i18n/server'

/**
 * Abonnement de ce navigateur aux notifications de cette IA.
 *
 * L'identité vient de la session, jamais du corps : deux personnes ne peuvent pas se
 * voler un abonnement. L'endpoint est validé (service de push connu, https) avant
 * d'entrer en base, parce que c'est une URL vers laquelle notre serveur postera ensuite.
 */
export const POST = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'push.subscribe' })
  if (!isPushConfigured()) throw AppError.badRequest('Notifications indisponibles')

  const body = await readJson(req, pushSubscriptionSchema, 8_000)
  const repo = getRepo()
  await repo.push.save({
    userId,
    appSlug: app.slug,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    // La langue est figée à l'abonnement : la relance part dans la langue choisie ici,
    // sans avoir à lire le compte au moment de l'envoi.
    locale: body.locale ?? (await getLocale(userId)),
  })
  await repo.events.track({ name: 'push_enabled', userId, appSlug: app.slug })
  return json({ enabled: true })
}, 'push.subscribe')

/** Désabonnement de ce navigateur. L'endpoint doit appartenir à la personne connectée. */
export const DELETE = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'push.unsubscribe' })

  const body = await readJson(req, pushUnsubscribeSchema, 8_000)
  const repo = getRepo()
  const removed = await repo.push.remove(userId, app.slug, body.endpoint)
  // Déjà parti : c'est le résultat voulu, pas une erreur.
  if (removed) await repo.events.track({ name: 'push_disabled', userId, appSlug: app.slug })
  return json({ enabled: false })
}, 'push.unsubscribe')
