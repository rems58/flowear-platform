import { registerServiceWorker, supportsPush, urlBase64ToUint8Array } from '@/lib/pwa/client'

export type SubscribeResult = 'on' | 'blocked' | 'off' | 'unsupported'

/**
 * Abonne ce navigateur aux notifications de cette IA : permission, service worker,
 * abonnement push (réutilisé s'il existe, il est partagé par toutes les IA du site), puis
 * la route de l'IA qui enregistre l'appareil. Partagé par le bouton du menu et les cartes.
 */
export async function subscribeToPush(endpoint: string, locale: string): Promise<SubscribeResult> {
  if (!supportsPush()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off'
  const registration = await registerServiceWorker()
  if (!registration) throw new Error('service worker indisponible')
  await navigator.serviceWorker.ready
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) throw new Error('clé VAPID absente')
  // `userVisibleOnly` est obligatoire : le navigateur n'autorise le push que s'il débouche
  // sur une notification visible, jamais pour du suivi silencieux.
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }))
  // `pushEndpoint` est l'adresse du service de push, à ne pas confondre avec notre route.
  const { endpoint: pushEndpoint, keys } = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: pushEndpoint, keys, locale }),
  })
  if (!res.ok) throw new Error(`api ${res.status}`)
  return 'on'
}

/** Ce navigateur a-t-il déjà un abonnement push (pour n'importe quelle IA du site) ? */
export async function hasPushSubscription(): Promise<boolean> {
  if (!supportsPush()) return false
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  return Boolean(subscription)
}
