import type { NextRequest } from 'next/server'
import { creatorDraftSchema, getCreatorApp, latestChecks, saveCreatorDraft } from '@/core/studio/draft'
import { draftErrorToResponse, requireCreator } from '@/lib/api/creator'
import { clientIp, json, rateLimitOrThrow, readJson, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** GET : l'IA du créateur connecté (son unique brouillon), avec les vérifications de sa version. */
export const GET = withRoute(async () => {
  const userId = await requireCreator()
  const repo = getRepo()
  const app = await getCreatorApp(repo, userId)
  const checks = app ? await latestChecks(repo, app) : []
  return json({ app, checks })
}, 'studio.app.get')

/** PUT : sauvegarde du brouillon (création au premier appel). */
export const PUT = withRoute(async (req: NextRequest) => {
  const userId = await requireCreator()
  await rateLimitOrThrow(`studio-save:${userId}`, 120, 60_000, { userId, ip: clientIp(req), route: 'studio.app.put' })
  const input = await readJson(req, creatorDraftSchema, 600_000)
  try {
    const app = await saveCreatorDraft(getRepo(), userId, input)
    return json({ app })
  } catch (error) {
    draftErrorToResponse(error)
  }
}, 'studio.app.put')
