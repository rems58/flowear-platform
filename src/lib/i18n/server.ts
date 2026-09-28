import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { getRepo } from '@/lib/db/repo'
import { LOCALE_COOKIE, LOCALE_HEADER, detectLocale, isLocale, type Locale } from './locale'
import { getMessages, type Messages } from './messages'

export type LocaleSource = 'query' | 'cookie' | 'db' | 'header' | 'default'

/**
 * Langue d'une requête, dans l'ordre :
 * 0. `?lang=` dans l'adresse (en-tête posé par le middleware ; sert aux robots et aux liens partagés),
 * 1. le cookie posé quand la personne a choisi sa langue (ce navigateur, y compris en web app),
 * 2. la préférence enregistrée sur son compte (autre appareil),
 * 3. la langue du navigateur (Accept-Language),
 * 4. l'anglais.
 */
export const resolveLocale = cache(async (userId?: string | null): Promise<{ locale: Locale; source: LocaleSource }> => {
  // `cache` : une seule résolution (et une seule lecture de la base) par requête, partagée entre
  // les métadonnées, la mise en page et la page.
  const forced = (await headers()).get(LOCALE_HEADER)
  if (isLocale(forced)) return { locale: forced, source: 'query' }
  const cookieValue = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(cookieValue)) return { locale: cookieValue, source: 'cookie' }
  if (userId) {
    try {
      const user = await getRepo().users.get(userId)
      if (user && isLocale(user.locale)) return { locale: user.locale, source: 'db' }
    } catch {
      /* base indisponible : on retombe sur le navigateur */
    }
  }
  const accept = (await headers()).get('accept-language')
  const detected = detectLocale(accept)
  return { locale: detected, source: accept ? 'header' : 'default' }
})

export async function getLocale(userId?: string | null): Promise<Locale> {
  return (await resolveLocale(userId)).locale
}

/** Langue et dictionnaire en un appel, pour les composants serveur. */
export async function getI18n(userId?: string | null): Promise<{ locale: Locale; t: Messages }> {
  const locale = await getLocale(userId)
  return { locale, t: getMessages(locale) }
}
