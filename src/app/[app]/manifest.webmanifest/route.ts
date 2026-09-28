import { NextResponse } from 'next/server'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { MANIFEST_HEADERS } from '@/core/pwa/headers'
import { appWebManifest } from '@/core/pwa/manifest'
import { isSafeSlug } from '@/core/security/sanitize'
import { resolveLocale } from '@/lib/i18n/server'

/**
 * Manifeste d'une IA : `/<slug>/manifest.webmanifest`. Installée, l'IA devient une
 * application à part entière, avec son nom, son icône et sa couleur, cantonnée à son
 * propre chemin (`scope`).
 *
 * Une IA privée sert son manifeste comme les autres : il ne contient que ce que le hub
 * montre déjà à qui y a accès, et le contrôle d'accès reste sur la page elle même.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ app: string }> }): Promise<Response> {
  const { app: slug } = await ctx.params
  await ensureAppsLoaded()
  if (!isSafeSlug(slug)) return new NextResponse(null, { status: 404 })
  const app = getApp(slug)
  if (!app) return new NextResponse(null, { status: 404 })
  const { locale } = await resolveLocale()
  return NextResponse.json(appWebManifest(app, locale), { headers: MANIFEST_HEADERS })
}
