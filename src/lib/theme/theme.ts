/**
 * Mode clair / sombre. Trois choix : clair, sombre, ou comme l'appareil (défaut).
 * Le choix vit dans le navigateur (localStorage), donc il survit à la web app installée.
 * La classe `dark` sur <html> pilote toutes les couleurs (variables CSS de globals.css).
 */
export const THEME_KEY = 'flowear.theme'
export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v)
}

export function readTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY)
    return isTheme(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

export function resolveDark(theme: Theme): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Applique le thème au document et le mémorise. */
export function applyTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
  document.documentElement.classList.toggle('dark', resolveDark(theme))
  window.dispatchEvent(new Event('flowear:theme'))
}

/**
 * Script exécuté avant le premier rendu, pour ne jamais afficher un flash clair en mode sombre.
 * Volontairement minuscule et sans dépendance : il lit localStorage et prefers-color-scheme.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`
