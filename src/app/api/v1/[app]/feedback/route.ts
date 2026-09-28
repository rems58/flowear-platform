import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { MESSAGE_ID_RE, sanitizeText } from '@/core/security/sanitize'
import { AppError } from '@/lib/api/errors'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireUser, withRoute, requireAppAccess } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

const bodySchema = z.object({
  messageId: z.string().regex(MESSAGE_ID_RE),
  rating: z.enum(['up', 'down']),
  reason: z.string().max(300).optional(),
})

/** POST : pouce haut ou bas sur une réponse de l'assistant appartenant à l'utilisateur. */
export const POST = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'feedback' })

  const body = await readJson(req, bodySchema, 8_000)
  const repo = getRepo()
  const reason = body.reason ? sanitizeText(body.reason, 300) : null
  const ok = await repo.messages.setFeedback(body.messageId, userId, body.rating, reason)
  if (!ok) throw AppError.notFound('Message introuvable')
  await repo.events.track({ name: 'feedback', userId, appSlug: app.slug, props: { rating: body.rating, messageId: body.messageId, hasReason: Boolean(reason) } })
  return json({ ok: true })
}, 'feedback')
