import type { NextRequest } from 'next/server'
import { isSlugAvailable } from '@/core/studio/draft'
import { requireCreator } from '@/lib/api/creator'
import { clientIp, json, rateLimitOrThrow, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** GET ?slug= : disponibilité d'un slug pour le créateur connecté, vérifiée en direct pendant la saisie. */
export const GET = withRoute(async (req: NextRequest) => {
  const userId = await requireCreator()
  await rateLimitOrThrow(`studio-slug:${userId}`, 60, 60_000, { userId, ip: clientIp(req), route: 'studio.app.slug' })
  const slug = (req.nextUrl.searchParams.get('slug') ?? '').slice(0, 40)
  return json({ slug, status: await isSlugAvailable(getRepo(), slug, userId) })
}, 'studio.app.slug')
