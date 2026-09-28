import type { PlanId } from '@/core/config/defaults'
import type { AppConfig } from '@/core/config/schema'
import type { Subscription } from '@/core/data/types'

/** Slug réservé au bundle : un abonnement Flowear ouvre toutes les IA. */
export const BUNDLE_SLUG = 'flowear'

/** Statuts Stripe qui donnent accès. `past_due` garde l'accès quelques jours, Stripe relance. */
export const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

/**
 * Un abonnement par IA n'ouvre que cette IA. Seul le bundle ouvre tout.
 * Décision Rémy du 15 septembre 2026.
 */
export function resolvePlan(subscriptions: readonly Subscription[], appSlug: string, now = new Date()): PlanId {
  const paid = subscriptions.some((s) => isCurrent(s, now) && (s.appSlug === appSlug || s.appSlug === BUNDLE_SLUG))
  return paid ? 'paid' : 'free'
}

/** Un abonnement compte tant que sa période court ; `past_due` garde 3 jours de grâce, la semaine d'accueil aucun. */
function isCurrent(s: Subscription, now: Date): boolean {
  if (!ACTIVE_STATUSES.has(s.status)) return false
  if (!s.currentPeriodEnd) return true
  const grace = s.status === 'past_due' ? 3 * 86_400_000 : 0
  return new Date(s.currentPeriodEnd).getTime() >= now.getTime() - grace
}

/**
 * État d'accès : plan, semaine d'accueil en cours (seulement si c'est elle qui ouvre l'accès),
 * semaine terminée récemment, et `freeSince` : le moment où la personne est repassée en gratuit
 * (fin de la dernière période payée ou d'essai), pour ne pas lui compter l'usage d'avant.
 */
export interface AccessState {
  plan: PlanId
  trialEndsAt: string | null
  trialEndedRecently: boolean
  freeSince: string | null
}

export function resolveAccess(subscriptions: readonly Subscription[], appSlug: string, now = new Date()): AccessState {
  const covers = (s: Subscription) => s.appSlug === appSlug || s.appSlug === BUNDLE_SLUG
  const plan = resolvePlan(subscriptions, appSlug, now)
  const paidWithoutTrial = subscriptions.some((s) => s.status !== 'trialing' && isCurrent(s, now) && covers(s))
  const trials = subscriptions.filter((s) => s.status === 'trialing' && covers(s) && s.currentPeriodEnd)
  const running = paidWithoutTrial ? undefined : trials.find((s) => isCurrent(s, now))
  const ended = trials.find((s) => !isCurrent(s, now) && new Date(s.currentPeriodEnd as string).getTime() > now.getTime() - 14 * 86_400_000)
  const lastPaidEnd = subscriptions
    .filter((s) => covers(s) && s.currentPeriodEnd && !isCurrent(s, now))
    .map((s) => s.currentPeriodEnd as string)
    .sort()
    .at(-1)
  return {
    plan,
    trialEndsAt: running?.currentPeriodEnd ?? null,
    trialEndedRecently: plan === 'free' && Boolean(ended),
    freeSince: plan === 'free' ? (lastPaidEnd ?? null) : null,
  }
}

/** Jours restants d'une semaine d'accueil, arrondis au jour supérieur ; `null` hors semaine. */
export function trialDaysLeft(access: Pick<AccessState, 'trialEndsAt'>, now = new Date()): number | null {
  if (!access.trialEndsAt) return null
  return Math.max(0, Math.ceil((new Date(access.trialEndsAt).getTime() - now.getTime()) / 86_400_000))
}

/** Début de la fenêtre mensuelle de quota : le 1er du mois, ou le passage en gratuit s'il est plus récent. */
export function quotaWindowStart(access: Pick<AccessState, 'freeSince'>, monthStart: Date): Date {
  if (access.freeSince && new Date(access.freeSince).getTime() > monthStart.getTime()) return new Date(access.freeSince)
  return monthStart
}

export interface QuotaCheck {
  allowed: boolean
  remaining: number
  limit: number
  reason?: 'messages' | 'messages_month' | 'cost' | 'cost_month'
}

/**
 * Quota du jour : messages par plan, puis plafond de coût du jour (plan, puis global),
 * puis plafond de coût du mois. Les abonnés aussi sont bornés.
 */
export function checkDailyQuota(input: {
  plan: PlanId
  config: AppConfig
  messagesToday: number
  messagesMonth?: number
  costTodayUsd: number
  costMonthUsd?: number
  /** Semaine d'accueil en cours : plan payant, mais plafonds de coût de l'essai. */
  trialing?: boolean
  /** Messages gagnés aujourd'hui en regardant des vidéos (gratuit seulement). */
  bonusMessagesToday?: number
}): QuotaCheck {
  const planCfg = input.config.plans[input.plan]
  const limit = (planCfg?.messagesPerDay ?? 0) + (input.plan === 'free' ? (input.bonusMessagesToday ?? 0) : 0)
  const remaining = Math.max(0, limit - input.messagesToday)
  if (remaining <= 0) return { allowed: false, remaining: 0, limit, reason: 'messages' }
  const monthLimit = planCfg?.messagesPerMonth ?? Infinity
  if ((input.messagesMonth ?? 0) >= monthLimit) return { allowed: false, remaining: 0, limit, reason: 'messages_month' }
  const trial = input.trialing ? input.config.trial : null
  const cap = Math.min(planCfg?.maxUsdPerDay ?? Infinity, input.config.costGuard.maxUsdPerUserPerDay, trial?.maxUsdPerDay ?? Infinity)
  if (input.costTodayUsd >= cap) return { allowed: false, remaining, limit, reason: 'cost' }
  const monthCap = Math.min(planCfg?.maxUsdPerMonth ?? Infinity, trial?.maxUsdTotal ?? Infinity)
  if ((input.costMonthUsd ?? 0) >= monthCap) return { allowed: false, remaining, limit, reason: 'cost_month' }
  return { allowed: true, remaining, limit }
}

/**
 * Coût estimé en USD à partir de la grille de prix (USD par million de tokens).
 * Un modèle absent de la grille est facturé au tarif de secours, volontairement élevé :
 * mieux vaut surestimer et bloquer que compter zéro et laisser filer.
 */
export function estimateCostUsd(
  config: AppConfig,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const price = (config.pricing as Record<string, Record<string, { input: number; output: number }>>)[provider]?.[model] ?? config.costGuard.unknownModelPrice
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}

/** Vrai si la grille connaît ce modèle : sinon la boucle agent journalise un avertissement. */
export function hasKnownPrice(config: AppConfig, provider: string, model: string): boolean {
  return Boolean((config.pricing as Record<string, Record<string, unknown>>)[provider]?.[model])
}
