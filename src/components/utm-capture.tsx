'use client'

import { useEffect } from 'react'

export const UTM_COOKIE = 'flowear_utm'
const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'ref']

/**
 * Garde les `utm_*` de la première visite dans un cookie de trente jours. Le compte se
 * crée plus tard, souvent depuis une autre page : c'est à l'onboarding terminé que le
 * cookie est lu et rattaché à l'événement, pour savoir d'où venait la personne.
 * Le premier arrivé gagne : une visite suivante par un autre lien n'écrase pas la source.
 */
export function UtmCapture() {
  useEffect(() => {
    try {
      if (document.cookie.split('; ').some((c) => c.startsWith(`${UTM_COOKIE}=`))) return
      const params = new URLSearchParams(window.location.search)
      const utm: Record<string, string> = {}
      for (const key of UTM_KEYS) {
        // `?ref=code` (lien d'un créateur) vaut `utm_ref` : plus court à partager.
        const value = (key === 'ref' ? (params.get('ref') ?? params.get('utm_ref')) : params.get(`utm_${key}`))?.trim().toLowerCase()
        if (value) utm[key] = value.slice(0, 80)
      }
      if (!Object.keys(utm).length) return
      if (utm.ref && !utm.source) utm.source = 'creator'
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${UTM_COOKIE}=${encodeURIComponent(JSON.stringify(utm))}; Path=/; Max-Age=${30 * 86_400}; SameSite=Lax${secure}`
    } catch {
      /* cookies bloqués : pas d'attribution, rien d'autre ne change */
    }
  }, [])
  return null
}
