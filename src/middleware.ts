import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isLocale } from '@/core/i18n/locale'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_HEADER } from '@/lib/i18n/locale'
import type { NextFetchEvent, NextRequest } from 'next/server'

/**
 * Domaine de l'API Clerk, encodé dans la clé publishable (`pk_test_<base64>` où le base64
 * vaut « host$ »). Il diffère entre l'instance de développement et celle de production, on le
 * calcule donc au lieu de l'écrire en dur. Sans lui dans `script-src`, le script de Clerk est
 * bloqué et la connexion ne fonctionne plus.
 */
function clerkFrontendApiOrigin(): string[] {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (!key) return []
  try {
    const host = atob(key.replace(/^pk_(test|live)_/, '')).replace(/\$$/, '')
    return host ? [`https://${host}`] : []
  } catch {
    return []
  }
}

/** Domaines de la régie de pub récompensée, seulement si elle est configurée (`NEXT_PUBLIC_AD_PROVIDER`). */
const AD_ORIGINS = process.env.NEXT_PUBLIC_AD_PROVIDER === 'gam' ? ['https://securepubads.g.doubleclick.net', 'https://pagead2.googlesyndication.com', 'https://tpc.googlesyndication.com', 'https://www.googletagservices.com', 'https://*.doubleclick.net', 'https://*.googlesyndication.com'] : []

/** Widget anti-robot de Clerk, servi par Cloudflare. */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

/**
 * Attache le contexte Clerk à chaque requête et pose la politique de sécurité du contenu.
 * Le contrôle d'accès est posé sur chaque ressource (`requireUser` dans les routes, `auth()`
 * dans les pages), pas par chemin : un filtrage par chemin peut diverger du routage et
 * laisser une page joignable.
 *
 * Le fichier s'appelle middleware.ts et non proxy.ts : Next 16 déprécie ce nom, mais Vercel
 * n'exécute pas encore proxy.ts (vérifié sur ultimate-cars le 4 septembre 2026, Clerk
 * remontait « can't detect clerkMiddleware() »).
 *
 * CSP posée par Clerk, en mode non strict. Le mode strict (nonce + `strict-dynamic`) a été
 * essayé le 16 septembre 2026 et bloque le script de Clerk : notre `ClerkProvider` est un
 * composant client (il suit le thème sombre), donc Clerk injecte son script depuis le
 * navigateur, sans nonce, et `strict-dynamic` désactive l'autorisation par domaine. Y revenir
 * demande de repasser `ClerkProvider` côté serveur, donc de transmettre le thème autrement.
 *
 * Ce qui est fermé malgré tout : `default-src 'self'`, `connect-src` restreint (une injection
 * ne peut pas exfiltrer vers un domaine tiers), `frame-ancestors 'none'`, `base-uri 'none'`,
 * `object-src 'none'`, `form-action 'self'`, `img-src` restreint, et les jokers `https:` et
 * `http:` retirés de `script-src` (voir `tightenScriptSrc`).
 */
/**
 * `?lang=fr` force la langue de cette requête (en-tête lu par `resolveLocale`) et la garde en
 * cookie pour la suite. C'est ce qui permet à Google d'indexer une version par langue via les
 * `hreflang` du hub : un robot n'a ni cookie ni Accept-Language, il n'aurait vu que l'anglais.
 */
function withLang(req: NextRequest): NextResponse {
  const lang = req.nextUrl.searchParams.get('lang')
  if (!isLocale(lang)) return NextResponse.next()
  const headers = new Headers(req.headers)
  headers.set(LOCALE_HEADER, lang)
  const res = NextResponse.next({ request: { headers } })
  res.cookies.set(LOCALE_COOKIE, lang, { path: '/', maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:' })
  return res
}

const withClerk = clerkMiddleware((_auth, req) => withLang(req), {
  contentSecurityPolicy: {
    directives: {
      // Domaines qui servaient par le joker `https:`, que l'on retire juste après :
      // celui de Clerk, et celui de Cloudflare Turnstile. Turnstile est le widget qui porte
      // la protection anti-robot de Clerk : Clerk n'autorise que son cadre (`frame-src`),
      // pas son script. Sans lui, l'inscription échoue sur « validations de sécurité
      // incorrectes », constaté en production le 16 septembre 2026.
      'script-src': [...clerkFrontendApiOrigin(), TURNSTILE_ORIGIN, ...AD_ORIGINS],
      // Rien ne peut nous encadrer : protection contre le détournement de clic.
      'frame-ancestors': ["'none'"],
      // Aucune balise <base> injectée ne peut détourner les URL relatives.
      'base-uri': ["'none'"],
      'object-src': ["'none'"],
      // Polices servies depuis notre origine (next/font les héberge lui-même).
      'font-src': ["'self'"],
      // Clerk dessine certains fonds en SVG intégré ; `blob:` servira aux aperçus d'image.
      'img-src': ['data:', 'blob:', ...AD_ORIGINS],
      // Une régie de pub récompensée affiche sa vidéo dans un cadre à elle ; rien sans régie.
      ...(AD_ORIGINS.length ? { 'frame-src': AD_ORIGINS, 'connect-src': ["'self'", ...AD_ORIGINS] } : {}),
      // Le paiement se fait sur les pages hébergées par Stripe, jamais dans une frame chez nous.
      'form-action': ["'self'"],
    },
  },
})

/**
 * Retire les jokers `https:` et `http:` de `script-src`. Clerk les ajoute en mode non strict,
 * ce qui reviendrait à autoriser n'importe quel domaine du web à servir un script. Sans eux,
 * il ne reste que notre origine et les domaines nommés (Clerk, Stripe). `'unsafe-inline'`
 * reste nécessaire au script de thème et aux scripts de Next.
 */
function tightenScriptSrc(headers: Headers): void {
  for (const name of ['content-security-policy', 'content-security-policy-report-only']) {
    const value = headers.get(name)
    if (!value) continue
    const tightened = value
      .split(';')
      .map((directive) => {
        const parts = directive.trim().split(/\s+/)
        if (parts[0] !== 'script-src' && parts[0] !== 'script-src-elem') return directive
        return ` ${parts.filter((p) => p !== 'https:' && p !== 'http:').join(' ')}`
      })
      .join(';')
    headers.set(name, tightened)
  }
}

export default async function middleware(req: NextRequest, evt: NextFetchEvent) {
  const res = await withClerk(req, evt)
  if (res instanceof Response) tightenScriptSrc(res.headers)
  return res
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
