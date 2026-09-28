'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { applyTheme, readTheme, resolveDark, type Theme } from './theme'

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  window.addEventListener('flowear:theme', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    media.removeEventListener('change', onChange)
    window.removeEventListener('flowear:theme', onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Thème choisi et mode effectif (sombre ou non), synchronisés avec l'appareil quand le choix est « système ». */
export function useTheme(): { theme: Theme; dark: boolean; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme)
  const dark = useSyncExternalStore(subscribe, () => resolveDark(readTheme()), () => false)
  // Si l'appareil change de mode alors que le choix est « système », la classe suit.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  const setTheme = useCallback((t: Theme) => applyTheme(t), [])
  return { theme, dark, setTheme }
}
