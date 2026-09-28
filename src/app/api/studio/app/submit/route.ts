import { after, type NextRequest } from 'next/server'
import { z } from 'zod'
import { submitCreatorApp, type ScenarioRunner } from '@/core/studio/draft'
import { runScenario } from '@/core/studio/scenario'
import { getChatDeps } from '@/lib/api/chat-deps'
import { draftErrorToResponse, requireCreator } from '@/lib/api/creator'
import { clientIp, json, rateLimitOrThrow, readJson, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

const bodySchema = z.object({
  /** Version des CGU Studio acceptée, telle qu'affichée : doit être la courante. */
  termsVersion: z.string().max(20).nullable(),
  /** Site du créateur, autorisé dans ses textes. */
  site: z.string().max(120).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i).optional(),
})

/**
 * POST : soumission de l'IA à la revue. Les douze règles puis le scénario en bac à sable
 * (six appels au modèle, coût compté sur le créateur), tout enregistré ; un échec renvoie
 * la liste complète en 400 `checks_failed`. Cinq soumissions par jour et par personne.
 */
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await requireCreator()
  await rateLimitOrThrow(`studio-submit:${userId}`, 5, 24 * 60 * 60 * 1000, { userId, ip: clientIp(req), route: 'studio.app.submit' })
  const body = await readJson(req, bodySchema, 4_000)
  const repo = getRepo()
  const scenario: ScenarioRunner = async ({ manifest, knowledge, ownerId }) => {
    const deps = getChatDeps()
    deps.defer = (work) => after(work)
    return runScenario(deps, { manifest, knowledge, ownerId, locale: 'fr' })
  }
  try {
    const { app, results } = await submitCreatorApp(repo, userId, { termsVersion: body.termsVersion, allowedHosts: body.site ? [body.site] : [] }, scenario)
    await repo.audit.require({ userId, action: 'creator_submit', details: { slug: app.slug, version: app.version }, ip: clientIp(req) })
    return json({ app, results })
  } catch (error) {
    draftErrorToResponse(error)
  }
}, 'studio.app.submit')
