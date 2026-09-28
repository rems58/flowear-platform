/**
 * Petites aides côté navigateur pour l'installation et les notifications.
 * Aucune ne touche au réseau : elles ne font que lire ce que le navigateur expose.
 */

/** L'application tourne depuis l'écran d'accueil, pas dans un onglet. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // `standalone` est la propriété d'iOS, antérieure à la norme ; l'autre couvre le reste.
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true
}

/**
 * iPhone et iPad. Safari n'expose pas `beforeinstallprompt` : l'installation s'y fait à la
 * main par le bouton partager, et c'est aussi la condition pour recevoir des notifications.
 * Depuis iPadOS 13, un iPad se présente comme un Mac : on le reconnaît à l'écran tactile.
 */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Appareil tactile d'abord : téléphone ou tablette.
 *
 * `pointer: coarse` décrit le pointeur principal, celui avec lequel on désigne vraiment :
 * un doigt sur un téléphone, une souris sur un ordinateur. Un portable à écran tactile a
 * donc un pointeur fin et n'est pas concerné, ce qui est le résultat voulu : « Ajouter à
 * l'écran d'accueil » n'a de sens que là où il y a un écran d'accueil. On double avec le
 * nombre de points de contact, quelques navigateurs de bureau annonçant `coarse` à tort.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0
}

export function supportsPush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * Clé publique VAPID : le navigateur la veut en octets, elle nous arrive en base64url.
 * `atob` ne connaît que le base64 classique, d'où le remplacement des deux caractères
 * qui changent et le rétablissement du remplissage.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = window.atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  // Tampon construit explicitement : `subscribe` n'accepte pas un tampon potentiellement partagé.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Enregistre le service worker, ou `null` si le navigateur n'en veut pas. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    // `updateViaCache: 'none'` : le fichier du service worker n'est jamais servi depuis le
    // cache HTTP, sinon une correction pourrait mettre des jours à atteindre les appareils.
    return await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
  } catch {
    return null
  }
}
