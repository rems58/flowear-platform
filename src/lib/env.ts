import 'server-only'
import { z } from 'zod'
import type { ProviderKeys } from '@/core/agent/models'

/**
 * Variables d'environnement, validées une fois au premier accès, côté serveur uniquement.
 * Seules les variables `NEXT_PUBLIC_*` sont visibles du navigateur : elles ne
 * contiennent que des clés publishable. Aucun secret ne sort de ce module.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3030'),

    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY manquante'),
    CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY manquante'),
    CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
    ADMIN_CLERK_USER_IDS: z.string().default(''),
    /**
     * Testeurs : ils voient les IA privées comme les administrateurs, mais suivent le
     * parcours normal (semaine d'accueil, puis mur, puis abonnement). Sert à éprouver
     * l'offre sur une IA privée sans la rendre publique.
     */
    TESTER_CLERK_USER_IDS: z.string().default(''),

    SUPABASE_URL: z.string().url('SUPABASE_URL invalide'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY manquante'),

    OPENROUTER_API_KEY: z.string().min(1).optional(),
    GROQ_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    MISTRAL_API_KEY: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),

    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

    /** Recherche web (Tavily). Absente : le tool n'est pas proposé au modèle. */
    TAVILY_API_KEY: z.string().min(1).optional(),

    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).optional(),
    /** Vercel Cron : Authorization: Bearer <CRON_SECRET>. Sans lui, les routes cron répondent 503. */
    CRON_SECRET: z.string().min(16).optional(),

    /**
     * Web Push (VAPID). La clé publique part dans le navigateur, c'est son rôle : elle
     * identifie notre serveur auprès du service de push. La privée signe les envois.
     * Sans elles, les notifications sont simplement indisponibles, rien ne casse.
     */
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    /** Régie de pub récompensée : `gam` (Google Ad Manager) ou absente. Le bouton n'existe pas sans elle. */
    NEXT_PUBLIC_AD_PROVIDER: z.enum(['gam']).optional(),
    /** Chemin du bloc récompensé Ad Manager, ex. `/1234567/flowear-rewarded`. */
    NEXT_PUBLIC_GAM_REWARDED_SLOT: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    /** Contact exigé par la norme, pour qu'un service de push puisse nous joindre. */
    VAPID_SUBJECT: z.string().regex(/^(mailto:.+@.+|https:\/\/.+)$/, 'VAPID_SUBJECT doit être un mailto: ou une URL https').optional(),

    /** Whop (deuxième caisse) : secret de signature du webhook, clé d'entreprise, et produits → IA. */
    WHOP_WEBHOOK_SECRET: z.string().startsWith('ws_').optional(),
    WHOP_API_KEY: z.string().min(1).optional(),
    /** `prod_xxx=amorce, prod_yyy=flowear` : quel produit Whop ouvre quelle IA (ou le bundle). */
    WHOP_PRODUCTS: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
    // Prix du bundle, créés par `npm run stripe:setup`. Les prix d'une IA ne sont pas ici :
    // ils se créent depuis son manifeste au premier paiement, pour porter son nom.
    STRIPE_PRICE_BUNDLE_MONTHLY: z.string().startsWith('price_').optional(),
    STRIPE_PRICE_BUNDLE_YEARLY: z.string().startsWith('price_').optional(),
    /** Coupon Stripe de l'offre de bienvenue (moitié prix, une fois) : créé par `npm run stripe:setup`. */
    STRIPE_COUPON_WELCOME: z.string().optional(),
  })
  .refine((e) => e.OPENROUTER_API_KEY || e.GROQ_API_KEY || e.OPENAI_API_KEY || e.MISTRAL_API_KEY || e.GEMINI_API_KEY, {
    message: 'Au moins une clé IA est requise (OPENROUTER_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, MISTRAL_API_KEY ou GEMINI_API_KEY)',
  })
  .refine((e) => e.NODE_ENV !== 'production' || (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN), {
    message: 'En production, UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN sont obligatoires (rate limiting)',
  })
  // Une demi-paire de clés VAPID ne sert à rien et laisserait le bouton s'afficher sans
  // qu'aucune notification ne puisse partir : c'est tout ou rien.
  .refine((e) => Boolean(e.NEXT_PUBLIC_VAPID_PUBLIC_KEY) === Boolean(e.VAPID_PRIVATE_KEY), {
    message: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY vont ensemble (npm run push:keys)',
  })
  .refine((e) => !e.VAPID_PRIVATE_KEY || Boolean(e.VAPID_SUBJECT), {
    message: 'VAPID_SUBJECT est requis avec les clés VAPID (mailto:contact@flowear.app)',
  })

export type ServerEnv = z.infer<typeof schema>

/** Où tourne ce processus : sur Vercel, ou sur la machine de quelqu'un. */
export function isOnVercel(): boolean {
  return process.env.VERCEL === '1'
}

/**
 * Environnement d'un service, déduit du préfixe de sa clé. Sert au garde-fou ci-dessous
 * et à `npm run env:check`.
 */
export type ServiceMode = 'test' | 'live' | 'absent'

export function clerkMode(env: ServerEnv): ServiceMode {
  if (!env.CLERK_SECRET_KEY) return 'absent'
  return env.CLERK_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test'
}

export function stripeMode(env: ServerEnv): ServiceMode {
  if (!env.STRIPE_SECRET_KEY) return 'absent'
  return env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test'
}

/**
 * Garde-fou : des clés de production sur une machine de développement, c'est un vrai paiement
 * débité ou un vrai compte créé pendant un essai. On refuse de démarrer, plutôt que de laisser
 * la bêtise arriver. Sur Vercel, les clés de production sont évidemment légitimes.
 */
function assertNoLiveKeysLocally(env: ServerEnv): void {
  if (isOnVercel()) return
  const live: string[] = []
  if (clerkMode(env) === 'live') live.push('Clerk (CLERK_SECRET_KEY)')
  if (env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_live_')) live.push('Clerk (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)')
  if (stripeMode(env) === 'live') live.push('Stripe (STRIPE_SECRET_KEY)')
  if (live.length === 0) return
  throw new Error(
    `Clés de production détectées hors de Vercel : ${live.join(', ')}.\n` +
      `Sur ta machine, utilise les clés de test. Récupère-les dans les tableaux de bord Clerk et Stripe,\n` +
      `ou lance « npm run env:check » pour voir sur quoi chaque service est branché.`
  )
}

let cached: ServerEnv | null = null

export function getServerEnv(): ServerEnv {
  if (cached) return cached
  // Une variable laissée vide dans .env.local vaut « absente » : sinon la chaîne vide échoue
  // sur les règles des variables facultatives (`startsWith`, `min`), et rien ne démarre.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''))
  const result = schema.safeParse(raw)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || 'env'} : ${i.message}`).join('\n')
    throw new Error(`Variables d'environnement invalides :\n${lines}\nVérifie .env.local (modèle : .env.example).`)
  }
  assertNoLiveKeysLocally(result.data)
  cached = result.data
  return cached
}

export function getProviderKeys(env: ServerEnv = getServerEnv()): ProviderKeys {
  return {
    openrouter: env.OPENROUTER_API_KEY,
    groq: env.GROQ_API_KEY,
    openai: env.OPENAI_API_KEY,
    mistral: env.MISTRAL_API_KEY,
    google: env.GEMINI_API_KEY,
  }
}

function idSet(value: string): Set<string> {
  return new Set(
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

export function getAdminIds(env: ServerEnv = getServerEnv()): Set<string> {
  return idSet(env.ADMIN_CLERK_USER_IDS)
}

/** Testeurs : accès aux IA privées, sans aucun privilège de plan ni de quota. */
export function getTesterIds(env: ServerEnv = getServerEnv()): Set<string> {
  return idSet(env.TESTER_CLERK_USER_IDS)
}

/** Qui a le droit de voir une IA privée : les administrateurs et les testeurs. */
export function canSeePrivateApps(userId: string | null | undefined, env: ServerEnv = getServerEnv()): boolean {
  if (!userId) return false
  return getAdminIds(env).has(userId) || getTesterIds(env).has(userId)
}

/** Les notifications push ne sont possibles que si la paire de clés VAPID est posée. */
export function isPushConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT)
}

/** Réservé aux tests. */
export function resetEnvCache(): void {
  cached = null
}
