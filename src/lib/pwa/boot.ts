/**
 * Capture de l'événement d'installation, au plus tôt.
 *
 * Chrome et les navigateurs de sa famille n'annoncent qu'une fois, très tôt après le
 * chargement, qu'une installation est possible (`beforeinstallprompt`). Un composant React
 * qui s'abonne après l'hydratation arrive systématiquement trop tard : l'événement est déjà
 * passé, et la bannière ne s'affiche jamais. C'est ce qui se produisait sur Rémy.
 *
 * Ce script est donc exécuté au parsing du document, avant tout le reste. Il met l'événement
 * de côté et prévient l'application, qui le retrouve qu'elle soit prête avant ou après.
 */
export const INSTALL_EVENT_KEY = '__flowearInstallEvent'
export const INSTALLABLE_EVENT = 'flowear:installable'
export const INSTALLED_EVENT = 'flowear:installed'

export const INSTALL_BOOT_SCRIPT = `(function(){try{
var w=window;w.${INSTALL_EVENT_KEY}=null;
w.addEventListener('beforeinstallprompt',function(e){e.preventDefault();w.${INSTALL_EVENT_KEY}=e;w.dispatchEvent(new Event('${INSTALLABLE_EVENT}'))});
w.addEventListener('appinstalled',function(){w.${INSTALL_EVENT_KEY}=null;w.dispatchEvent(new Event('${INSTALLED_EVENT}'))});
}catch(e){}})()`

/** Événement propre à Chrome et consorts : il faut le garder pour pouvoir le rejouer au clic. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** L'événement mis de côté par le script ci-dessus, s'il est déjà passé. */
export function pendingInstallEvent(): InstallPromptEvent | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as Record<string, InstallPromptEvent | null>)[INSTALL_EVENT_KEY] ?? null
}
