import { NextResponse } from 'next/server'
import { hubWebManifest } from '@/core/pwa/manifest'
import { MANIFEST_HEADERS } from '@/core/pwa/headers'
import { getMessages } from '@/lib/i18n/messages'
import { resolveLocale } from '@/lib/i18n/server'

/**
 * Manifeste du hub Flowear. Route à la main plutôt que la convention `app/manifest.ts` :
 * celle-ci poserait d'office un lien vers ce manifeste sur toutes les pages, y compris
 * celles d'une IA, qui doivent pointer vers le leur.
 */
export async function GET(): Promise<Response> {
  const { locale } = await resolveLocale()
  const t = getMessages(locale)
  return NextResponse.json(hubWebManifest('Flowear', t.meta.description, locale), { headers: MANIFEST_HEADERS })
}
