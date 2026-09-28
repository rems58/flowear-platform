import { useSyncExternalStore } from 'react'

/**
 * Préférence d'affichage gardée sur cet appareil (bloc replié, onglet choisi). Lue par
 * `useSyncExternalStore` : le serveur rend la valeur par défaut, le client la sienne, sans
 * décalage d'hydratation ni setState dans un effet. Le stockage peut manquer (navigation
 * privée) : on lit et écrit dans un try, la valeur par défaut fait foi.
 */
const listeners = new Set<() => void>()

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function setPreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Pas de stockage : le choix ne survit pas au rechargement, tant pis.
  }
  for (const l of listeners) l()
}

export function usePreference(key: string, fallback: string): string {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => read(key) ?? fallback,
    () => fallback
  )
}
