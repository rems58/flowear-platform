import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveAccess } from '@/core/billing/entitlements'
import { DEFAULTS } from '@/core/config/defaults'
import { resolveConfig } from '@/core/config/resolve'
import { startOfUtcDay } from '@/core/data/time'
import { AppError } from '@/lib/api/errors'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { getServerEnv } from '@/lib/env'

const bodySchema = z.discriminatedUnion('step', [z.object({ step: z.literal('start') }), z.object({ step: z.literal('complete'), nonce: z.string().min(16).max(80) })])

/** Une vidéo lancée doit être confirmée dans les dix minutes, sinon le nonce meurt. */
const GRANT_WINDOW_MS = 10 * 60_000

/**
 * Pub récompensée. `start` réserve un nonce avant de lancer la vidéo ; `complete` le confirme
 * quand la régie a dit que la vidéo est allée au bout. Le crédit du jour est relu à chaque
 * message par la boucle agent. Sans régie configurée, la route refuse : le bouton n'existe pas.
 */
export const POST = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'reward' })
  if (!getServerEnv().NEXT_PUBLIC_AD_PROVIDER) throw AppError.badRequest('Aucune régie configurée')

  const repo = getRepo()
  const [subs, settings] = await Promise.all([repo.subscriptions.listActive(userId), repo.appSettings.list()])
  const config = resolveConfig(app, settings)
  if (!config.ads.enabled) throw AppError.badRequest('Pub récompensée désactivée')
  if (resolveAccess(subs, app.slug).plan !== 'free') throw AppError.badRequest('Réservé au plan gratuit')

  const now = new Date()
  const day = startOfUtcDay(now).toISOString().slice(0, 10)
  const body = await readJson(req, bodySchema, 2_000)
  const today = await repo.rewards.today(userId, app.slug, day)

  if (body.step === 'start') {
    if (today.videos >= config.ads.maxVideosPerDay) throw AppError.badRequest('Plus de vidéo aujourd’hui')
    const nonce = crypto.randomUUID().replace(/-/g, '')
    await repo.rewards.start({ userId, appSlug: app.slug, day, nonce, messages: config.ads.rewardMessages })
    await repo.events.track({ name: 'ad_reward_started', userId, appSlug: app.slug, props: { videosToday: today.videos } })
    return json({ nonce, messages: config.ads.rewardMessages })
  }

  const granted = await repo.rewards.grant(body.nonce, userId, now, GRANT_WINDOW_MS)
  if (!granted) throw AppError.badRequest('Vidéo inconnue ou trop ancienne')
  const after = await repo.rewards.today(userId, app.slug, day)
  await repo.events.track({ name: 'ad_reward_granted', userId, appSlug: app.slug, props: { messages: granted.messages, videosToday: after.videos } })
  return json({ messages: granted.messages, bonusToday: after.messages, videosLeft: Math.max(0, config.ads.maxVideosPerDay - after.videos) })
}, 'reward')
