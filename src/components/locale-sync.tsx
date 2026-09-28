'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, type Locale } from '@/lib/i18n/locale'

/** Paramètre posé dans le `start_url` du manifeste, lu au premier lancement de l'app installée. */
export const LOCALE_PARAM = 'lang'

function writeCookie(locale: Locale): void {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
  } catch {
    /* cookies bloqués : la base reste la référence */
  }
}

/**
 * Deux recopies du choix de langue vers le cookie de ce navigateur.
 *
 * 1. La langue vient de la préférence du compte (nouvel appareil, cookie absent) : on la
 *    recopie pour que les requêtes suivantes n'aient plus besoin de la base.
 * 2. L'adresse porte `?lang=xx` : c'est le premier lancement d'une application ajoutée à
 *    l'écran d'accueil. Elle a son propre stockage, vide, donc sans ce paramètre la personne
 *    retrouverait la langue de son navigateur au lieu de celle qu'elle avait choisie. Le
 *    paramètre est retiré de l'adresse aussitôt lu, pour ne pas traîner dans les partages.
 *
 * Une langue seulement détectée (navigateur) n'est pas figée : elle suit le navigateur.
 */
export function LocaleSync({ locale, fromAccount }: { locale: Locale; fromAccount: boolean }) {
  const router = useRouter()
  useEffect(() => {
    const url = new URL(window.location.href)
    const requested = url.searchParams.get(LOCALE_PARAM)
    if (requested !== null) {
      url.searchParams.delete(LOCALE_PARAM)
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
      if (isLocale(requested)) {
        writeCookie(requested)
        // Le serveur a déjà rendu la page dans une autre langue : il faut la redemander.
        if (requested !== locale) router.refresh()
        return
      }
    }
    if (fromAccount) writeCookie(locale)
  }, [locale, fromAccount, router])
  return null
}
