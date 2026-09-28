import { after, type NextRequest } from 'next/server'
import { z } from 'zod'
import { appManifestSchema } from '@/apps/types'
import { SUPPORTED_LOCALES } from '@/core/i18n/locale'
import { createSandbox } from '@/core/studio/sandbox'
import { runManifestChecks } from '@/core/studio/checks'
import { sanitizeCreatorManifest } from '@/core/studio/manifest'
import { KNOWLEDGE_MAX_BYTES, KNOWLEDGE_MAX_FILES } from '@/core/studio/checks'
import { getChatDeps } from '@/lib/api/chat-deps'
import { requireCreator } from '@/lib/api/creator'
import { AppError } from '@/lib/api/errors'
import { clientIp, rateLimitOrThrow, readJson, withRoute } from '@/lib/api/guard'

import { SANDBOX_MESSAGES_PER_DAY } from '@/core/studio/limits'
const DAY_MS = 24 * 60 * 60 * 1000

const bodySchema = z.object({
  manifest: z.record(z.string(), z.unknown()),
  knowledge: z.array(z.object({ name: z.string().min(1).max(40), markdown: z.string().max(KNOWLEDGE_MAX_BYTES) })).max(KNOWLEDGE_MAX_FILES).default([]),
  locale: z.enum(SUPPORTED_LOCALES).default('en'),
  timezone: z.string().max(64).regex(/^[A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+)*$/).optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(4000) })).max(60).default([]),
  message: z.string().min(1).max(4000),
})

/**
 * POST /api/studio/sandbox : un tour de conversation avec un brouillon d'IA, pour son créateur.
 * Même boucle agent qu'en production, dépôt mémoire, rien d'écrit en base. Réservé aux
 * créateurs et aux administrateurs, 30 messages par jour et par personne.
 */
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await requireCreator()
  await rateLimitOrThrow(`sandbox:${userId}`, SANDBOX_MESSAGES_PER_DAY, DAY_MS, { userId, ip: clientIp(req), route: 'studio.sandbox' })
  const body = await readJson(req, bodySchema, 800_000)

  // Le brouillon doit au moins passer le schéma : le reste des règles est affiché, pas bloquant ici.
  const manifest = body.manifest as Parameters<typeof sanitizeCreatorManifest>[0]
  const parsed = appManifestSchema.safeParse(sanitizeCreatorManifest(manifest))
  if (!parsed.success) {
    throw AppError.badRequest('Manifeste invalide', { issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })) })
  }
  const failing = runManifestChecks({ manifest, knowledge: body.knowledge }).filter((c) => !c.ok)

  const deps = getChatDeps()
  // Titre et mémoire différés : après la réponse, comme en production, sur le dépôt mémoire.
  deps.defer = (work) => after(work)
  const sandbox = await createSandbox(deps, { manifest, knowledge: body.knowledge, ownerId: userId, locale: body.locale, timezone: body.timezone })
  const res = await sandbox.send(body.message, { history: body.history })
  // Les règles en échec voyagent dans un en-tête : le client les montre à côté de la conversation.
  const headers = new Headers(res.headers)
  if (failing.length) headers.set('x-flowear-checks', encodeURIComponent(JSON.stringify(failing.map((c) => c.check))))
  return new Response(res.body, { status: res.status, headers })
}, 'studio.sandbox')
