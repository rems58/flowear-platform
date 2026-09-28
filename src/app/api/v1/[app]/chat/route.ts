import { after, type NextRequest } from 'next/server'
import type { UIMessage } from 'ai'
import { z } from 'zod'
import { handleChat } from '@/core/agent/chat'
import { resolveConfig } from '@/core/config/resolve'
import { getChatDeps } from '@/lib/api/chat-deps'
import { loadKnowledge } from '@/lib/knowledge/loader'
import { getWebSearch } from '@/lib/search/tavily'
import { clientIp, getAppOr404, isAdmin, rateLimitOrThrow, readJson, requireUser, withRoute, requireAppAccess } from '@/lib/api/guard'
import { getLocale } from '@/lib/i18n/server'

const partSchema = z.object({ type: z.string().max(80) }).loose()

const bodySchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  /** Fuseau IANA du navigateur, pour les rappels à une heure locale. */
  timezone: z.string().max(64).regex(/^[A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+)*$/).optional(),
  messages: z
    .array(
      z.object({
        id: z.string().max(64),
        role: z.enum(['user', 'assistant']),
        parts: z.array(partSchema).max(60),
        metadata: z.unknown().optional(),
      })
    )
    .min(1)
    .max(400),
})

/**
 * POST /api/v1/[app]/chat : un message, une réponse en streaming (UI message stream).
 * Auth par session, rate limit par utilisateur, corps validé, quota et propriété
 * vérifiés dans `handleChat`.
 */
export const POST = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  const deps = getChatDeps()
  deps.knowledge = await loadKnowledge(app.slug)
  deps.webSearch = getWebSearch() ?? undefined
  // Titre, mémoire, alerte de coût : après la réponse, la fonction reste vivante le temps qu'il faut.
  deps.defer = (work) => after(work)

  // Les réglages sont lus une fois ici et transmis à la boucle agent.
  const settings = await deps.repo.appSettings.list()
  const config = resolveConfig(app, settings)
  await rateLimitOrThrow(`chat:${userId}`, config.rateLimits.chatPerMinute, 60_000, { userId, ip: clientIp(req), route: 'chat' })

  const body = await readJson(req, bodySchema, 512_000)
  // Cookie de choix explicite, sinon préférence du compte, sinon navigateur, sinon anglais.
  const locale = await getLocale(userId)

  return handleChat(deps, {
    userId,
    app,
    locale,
    settings,
    isAdmin: isAdmin(userId),
    conversationId: body.conversationId ?? null,
    timezone: body.timezone,
    messages: body.messages as UIMessage[],
  })
}, 'chat')
