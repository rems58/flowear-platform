import { auth } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { SUPPORTED_LOCALES } from '@/core/i18n/locale'
import { clientIp, rateLimitOrThrow, readJson, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { getServerEnv } from '@/lib/env'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/lib/i18n/locale'

const bodySchema = z.object({ locale: z.enum(SUPPORTED_LOCALES) })

/**
 * POST : la personne choisit sa langue. Cookie sur ce navigateur (un an, survit à la
 * web app), et préférence sur le compte si elle est connectée (autres appareils).
 * Ouvert aux visiteurs non connectés : le hub et les pages de connexion aussi se traduisent.
 */
export const POST = withRoute(async (req: NextRequest) => {
  const ip = clientIp(req)
  await rateLimitOrThrow(`locale:${ip}`, 30, 60_000, { ip, route: 'locale' })
  const { locale } = await readJson(req, bodySchema, 1_000)
  const { userId } = await auth()
  if (userId) await getRepo().users.upsert({ clerkUserId: userId, locale })

  const res = NextResponse.json({ data: { locale } })
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: getServerEnv().NODE_ENV === 'production',
    // Lisible par le client : il vérifie la cohérence avec la préférence du compte.
    httpOnly: false,
  })
  return res
}, 'locale')
