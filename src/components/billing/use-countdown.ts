'use client'

import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
function subscribe(onChange: () => void) {
  listeners.add(onChange)
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), 30_000)
  return () => {
    listeners.delete(onChange)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}
/** Minute courante ; `null` au rendu serveur (pas de compte à rebours figé dans le HTML). */
function useMinute(): number | null {
  return useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 60_000), () => null)
}

/**
 * Temps restant avant une date, en heures et minutes, remis à jour toutes les trente
 * secondes. `null` tant que le client n'a pas pris la main, et quand c'est passé.
 */
export function useCountdown(endsAt: string | null | undefined): { hours: number; minutes: number } | null {
  const minute = useMinute()
  if (!endsAt || minute === null) return null
  const left = new Date(endsAt).getTime() - minute * 60_000
  if (left <= 0) return null
  return { hours: Math.floor(left / 3_600_000), minutes: Math.floor((left % 3_600_000) / 60_000) }
}
