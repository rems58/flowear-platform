/**
 * Service worker de Flowear. Volontairement minuscule : il fait trois choses et rien d'autre.
 *
 * 1. Notifications push : afficher le message, et ouvrir la bonne IA au clic.
 * 2. Hors ligne : servir une page d'attente quand une navigation échoue.
 * 3. Se mettre à jour tout seul, sans laisser traîner d'ancienne version.
 *
 * Ce qu'il ne fait pas, délibérément : mettre en cache les pages ni les réponses de l'API.
 * Un chat est vivant, une réponse gardée en cache serait fausse la seconde d'après, et une
 * page privée gardée en cache resterait lisible après une déconnexion.
 */

const CACHE = 'flowear-v3'
const OFFLINE_URL = '/hors-ligne'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      // Une page d'attente absente ne doit jamais empêcher l'installation.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

/**
 * Seules les navigations sont interceptées, et toujours par le réseau d'abord : le service
 * worker ne s'interpose jamais entre l'application et ses données. Si le réseau manque, on
 * sert la page d'attente.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || request.mode !== 'navigate') return
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL)
      return cached ?? new Response('', { status: 504, statusText: 'Offline' })
    })
  )
})

/**
 * Message push. Le contenu est chiffré de bout en bout par le navigateur et notre serveur :
 * le service de push ne peut pas le lire, mais il pourrait en théorie en livrer un mal formé,
 * donc rien n'est affiché sans vérification, et l'URL d'ouverture reste relative à notre origine.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 120) : 'Flowear'
  const body = typeof data.body === 'string' ? data.body.slice(0, 240) : ''
  const path = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/'
  // L'icône de l'IA qui parle (jamais une adresse extérieure), Flowear à défaut.
  const icon = typeof data.icon === 'string' && /^\/pwa-icons\/[a-z0-9-]+-192\.png$/.test(data.icon) ? data.icon : '/pwa-icons/flowear-192.png'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/pwa-icons/flowear-192.png',
      tag: typeof data.tag === 'string' ? data.tag.slice(0, 60) : 'flowear',
      // Une relance ne réveille pas l'écran : elle attend d'être vue.
      renotify: false,
      silent: false,
      data: { path },
    })
  )
})

/** Clic sur la notification : on revient sur l'onglet déjà ouvert plutôt que d'en ouvrir un de plus. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = (event.notification.data && event.notification.data.path) || '/'
  const target = new URL(path, self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === target.origin && 'focus' in client) {
          client.navigate(target.href).catch(() => undefined)
          return client.focus()
        }
      }
      return self.clients.openWindow(target.href)
    })
  )
})
