import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createToolRequest } from '@/core/studio/dashboard'
import { draftErrorToResponse, requireCreator } from '@/lib/api/creator'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** POST : une idée d'outil pour l'IA du créateur connecté. Dix par jour, ça suffit à réfléchir. */
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await requireCreator()
  await rateLimitOrThrow(`studio-tools:${userId}`, 10, 24 * 60 * 60 * 1000, { userId, ip: clientIp(req), route: 'studio.app.tools' })
  const body = await readJson(req, z.object({ title: z.string().max(200), body: z.string().max(4000) }), 8_000)
  try {
    const request = await createToolRequest(getRepo(), userId, body)
    return json({ request: { ...request, ownerId: '' } })
  } catch (error) {
    if (error instanceof z.ZodError) throw AppError.badRequest('Données invalides', { issues: error.issues.slice(0, 3).map((i) => ({ path: i.path.join('.'), message: i.message })) })
    draftErrorToResponse(error)
  }
}, 'studio.app.tools')
