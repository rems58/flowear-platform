'use client'

import { useEffect } from 'react'
import { registerServiceWorker } from '@/lib/pwa/client'

/**
 * Enregistre le service worker, une fois, au chargement. Aucun rendu.
 *
 * Il est posé à la racine du site plutôt que par IA : un seul service worker sert le hub
 * et toutes les IA, et les notifications de toutes arrivent au même endroit. Un échec
 * (navigateur sans service worker, mode privé) ne casse rien : l'application reste normale,
 * seuls les notifications et le mode hors ligne manquent.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    void registerServiceWorker()
  }, [])
  return null
}
