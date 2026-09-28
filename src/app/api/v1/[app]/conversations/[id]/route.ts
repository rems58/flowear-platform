import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { AppError } from '@/lib/api/errors'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireUser, withRoute, requireAppAccess } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** GET : une conversation et ses messages, uniquement si elle appartient à l'utilisateur. */
export const GET = withRoute<{ app: string; id: string }>(async (req: NextRequest, ctx) => {
  const { app: slug, id } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'conversations.get' })
  if (!z.string().uuid().safeParse(id).success) throw AppError.notFound('Conversation introuvable')

  const repo = getRepo()
  const conversation = await repo.conversations.get(id, userId, app.slug)
  if (!conversation) throw AppError.notFound('Conversation introuvable')
  const messages = await repo.messages.list(conversation.id, userId, 200)
  return json({ conversation, messages })
}, 'conversations.get')

const patchSchema = z.object({ pinned: z.boolean() })

/** PATCH : épingler ou désépingler une conversation (elle reste en tête de la liste). */
export const PATCH = withRoute<{ app: string; id: string }>(async (req: NextRequest, ctx) => {
  const { app: slug, id } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'conversations.patch' })
  if (!z.string().uuid().safeParse(id).success) throw AppError.notFound('Conversation introuvable')
  const body = await readJson(req, patchSchema, 1_000)
  const ok = await getRepo().conversations.setPinned(id, userId, body.pinned)
  if (!ok) throw AppError.notFound('Conversation introuvable')
  return json({ pinned: body.pinned })
}, 'conversations.patch')
