import { z } from 'zod'

/**
 * Affiliation créateurs (docs/13-marketing-tiktok.md) : un créateur reçoit un lien
 * `flowear.app/amorce?ref=<code>`. Le `ref` suit le cookie d'origine jusqu'à l'onboarding,
 * où il est enregistré sur l'événement `onboarding_done`. Un paiement est attribué au code de
 * la **première** inscription de la personne. Une commission n'est due qu'après le délai de
 * rétractation, pour ne jamais payer un abonnement remboursé.
 */
export const PAYOUT_DELAY_DAYS = 30
export const DEFAULT_PAYOUT_EUR = 9

export const affiliateCodeSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'minuscules, chiffres et tirets')

export interface Affiliate {
  code: string
  name: string
  contact: string | null
  /** Mode fixe : montant par abonné payant (ignoré si `percent` est posé). */
  payoutEur: number
  /** Mode pourcentage : part de chaque paiement réellement encaissé. */
  percent: number | null
  /** Mode pourcentage : nombre de mois après le premier paiement pendant lesquels la part court (null = sans limite). */
  months: number | null
  /** Limité à une IA : seules ses inscriptions et ses paiements comptent (créateur Studio). */
  appSlug: string | null
  createdAt: string
}

export interface AffiliatePayment {
  userId: string
  amountCents: number
  createdAt: string
  appSlug: string | null
}

export interface AffiliateStatsRow extends Affiliate {
  /** Personnes dont la première inscription porte ce code. */
  signups: number
  /** Parmi elles, celles qui ont payé au moins une fois. */
  paying: number
  /** Parmi les payantes, celles dont le premier paiement a plus de `PAYOUT_DELAY_DAYS`. */
  eligible: number
  /** Encaissé auprès des personnes attribuées (mode pourcentage : dans la fenêtre de mois). */
  revenueEur: number
  /** À verser maintenant. */
  dueEur: number
  /** Gagné mais encore dans le délai de rétractation. */
  pendingEur: number
}

export interface AffiliateStatsInput {
  affiliates: Affiliate[]
  /** Événements `onboarding_done` portant un `ref`, tous codes confondus. */
  onboardings: { userId: string; ref: string; createdAt: string; appSlug: string | null }[]
  /** Date du premier paiement par personne (événement `subscribed` avec un abonnement Stripe). */
  subscriptions: { userId: string; firstPaidAt: string }[]
  /** Paiements encaissés (événement `payment`, montants réels après remise). */
  payments: AffiliatePayment[]
  now: Date
}

export function computeAffiliateStats({ affiliates, onboardings, subscriptions, payments, now }: AffiliateStatsInput): AffiliateStatsRow[] {
  // Première inscription par personne : c'est elle qui fixe le code, quoi qu'il arrive après.
  const firstRef = new Map<string, { ref: string; appSlug: string | null }>()
  for (const o of [...onboardings].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!firstRef.has(o.userId)) firstRef.set(o.userId, { ref: o.ref, appSlug: o.appSlug })
  }
  const paidAt = new Map(subscriptions.map((s) => [s.userId, s.firstPaidAt]))
  const cutoff = new Date(now.getTime() - PAYOUT_DELAY_DAYS * 86_400_000).toISOString()

  return affiliates.map((a) => {
    const users = [...firstRef.entries()].filter(([, first]) => first.ref === a.code && (a.appSlug === null || first.appSlug === a.appSlug)).map(([userId]) => userId)
    const paying = users.filter((u) => paidAt.has(u))
    const eligible = paying.filter((u) => (paidAt.get(u) as string) <= cutoff)
    if (a.percent === null) {
      const due = eligible.length * a.payoutEur
      const pending = (paying.length - eligible.length) * a.payoutEur
      return { ...a, signups: users.length, paying: paying.length, eligible: eligible.length, revenueEur: 0, dueEur: due, pendingEur: pending }
    }
    // Pourcentage : chaque paiement d'une personne attribuée compte, dans la fenêtre de mois
    // qui suit son premier paiement ; il est dû quand il a lui-même passé le délai.
    // « N mois » = les N premières mensualités : la fenêtre se ferme un jour avant la date
    // anniversaire, parce que Stripe peut encaisser la suivante quelques heures avant l'heure pile.
    const inWindow = (p: AffiliatePayment) => {
      const first = paidAt.get(p.userId)
      if (!first) return false
      if (a.months === null) return true
      const end = new Date(first)
      end.setUTCMonth(end.getUTCMonth() + a.months)
      end.setUTCDate(end.getUTCDate() - 1)
      return p.createdAt < end.toISOString()
    }
    const mine = payments.filter((p) => users.includes(p.userId) && inWindow(p) && (a.appSlug === null || p.appSlug === a.appSlug))
    const cents = (list: AffiliatePayment[]) => list.reduce((s, p) => s + p.amountCents, 0)
    const revenue = cents(mine) / 100
    const due = (cents(mine.filter((p) => p.createdAt <= cutoff)) / 100) * (a.percent / 100)
    const pending = (cents(mine.filter((p) => p.createdAt > cutoff)) / 100) * (a.percent / 100)
    const round = (v: number) => Math.round(v * 100) / 100
    return { ...a, signups: users.length, paying: paying.length, eligible: eligible.length, revenueEur: round(revenue), dueEur: round(due), pendingEur: round(pending) }
  })
}
