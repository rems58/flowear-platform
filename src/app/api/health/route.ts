import { NextResponse, type NextRequest } from 'next/server'
import { listPublicApps } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { clientIp, rateLimitOrThrow, withRoute } from '@/lib/api/guard'

/** GET : vivant, et la liste des IA publiées. Aucune donnée sensible. */
export const GET = withRoute(async (req: NextRequest) => {
  await rateLimitOrThrow(`health:${clientIp(req)}`, 60, 60_000, { ip: clientIp(req), route: 'health' })
  await ensureAppsLoaded()
  return NextResponse.json({ ok: true, apps: listPublicApps().map((a) => a.slug) })
}, 'health')
