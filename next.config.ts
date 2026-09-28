import type { NextConfig } from 'next'

/**
 * En-têtes de sécurité sur toutes les routes. La politique de sécurité du contenu (CSP)
 * n'est pas ici : elle est posée par `clerkMiddleware` dans `src/middleware.ts`, car elle
 * a besoin d'un nonce par requête. `X-Frame-Options` double `frame-ancestors` pour les
 * navigateurs anciens.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

/**
 * Le service worker ne doit jamais être servi depuis un cache : sinon une correction
 * mettrait des jours à atteindre les appareils, le fichier restant valable tant que son
 * cache n'a pas expiré. Le type explicite évite qu'un hébergement le serve en texte brut,
 * auquel cas le navigateur refuserait de l'enregistrer.
 */
const serviceWorkerHeaders = [
  { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
  { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
  // Il est enregistré à la racine du site : il peut contrôler le hub et toutes les IA.
  { key: 'Service-Worker-Allowed', value: '/' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/sw.js', headers: serviceWorkerHeaders },
    ]
  },
}

export default nextConfig
