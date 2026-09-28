import type { AppManifestInput } from '@/apps/types'
import { BRAND_IMAGE_RE } from '@/apps/types'
import type { Cohort, CreatorAppStatus, CreatorStats, FunnelRow } from '@/core/data/types'
import { PAYOUT_DELAY_DAYS } from '@/core/growth/affiliates'
import { pick, type Locale, type LocalizedText } from '@/core/i18n/locale'
import { NET_RATIO, type CreatorPayment } from './economics'

export interface PayoutLike {
  amountCents: number
  paidAt: string
}

export interface MonthRow {
  /** `AAAA-MM`, UTC. */
  month: string
  payingUsers: number
  grossEur: number
  netEur: number
  shareEur: number
  /** Part sur les paiements passés le délai de rétractation. */
  dueEur: number
  /** Part sur les paiements encore dans le délai. */
  pendingEur: number
}

export interface MoneyTotals {
  /** Personnes distinctes ayant payé au moins une fois. */
  payingUsers: number
  grossEur: number
  netEur: number
  shareEur: number
  dueEur: number
  pendingEur: number
  paidEur: number
  /** Reste à verser : dû moins déjà versé, jamais négatif. */
  balanceEur: number
  /** Versé en avance sur des parts encore en attente (versé au-delà du dû). */
  advanceEur: number
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Ce qu'une IA a rapporté, mois par mois (mois du paiement, UTC), la part du créateur, ce qui est
 * dû (paiements de plus de `PAYOUT_DELAY_DAYS`) et ce qui reste à verser après les versements
 * enregistrés. Seul calcul d'argent des créateurs : l'espace créateur, la page partagée et l'admin
 * l'utilisent tous, ils ne peuvent pas diverger.
 */
export function monthlyEarnings(input: { payments: CreatorPayment[]; payouts: PayoutLike[]; sharePercent: number; now: Date }): { months: MonthRow[]; totals: MoneyTotals } {
  const cutoff = new Date(input.now.getTime() - PAYOUT_DELAY_DAYS * 86_400_000).toISOString()
  const share = input.sharePercent / 100
  const byMonth = new Map<string, { users: Set<string>; gross: number; due: number; pending: number }>()
  const allUsers = new Set<string>()
  for (const p of input.payments) {
    if (p.amountCents <= 0) continue
    const month = p.createdAt.slice(0, 7)
    const row = byMonth.get(month) ?? { users: new Set<string>(), gross: 0, due: 0, pending: 0 }
    const eur = p.amountCents / 100
    row.users.add(p.userId)
    allUsers.add(p.userId)
    row.gross += eur
    const part = eur * NET_RATIO * share
    if (p.createdAt <= cutoff) row.due += part
    else row.pending += part
    byMonth.set(month, row)
  }
  const months = [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, r]) => ({ month, payingUsers: r.users.size, grossEur: round(r.gross), netEur: round(r.gross * NET_RATIO), shareEur: round(r.due + r.pending), dueEur: round(r.due), pendingEur: round(r.pending) }))
  const sum = (k: keyof Omit<MonthRow, 'month' | 'payingUsers'>) => round(months.reduce((s, m) => s + m[k], 0))
  const paidEur = round(input.payouts.reduce((s, p) => s + p.amountCents / 100, 0))
  const dueEur = sum('dueEur')
  return { months, totals: { payingUsers: allUsers.size, grossEur: sum('grossEur'), netEur: sum('netEur'), shareEur: sum('shareEur'), dueEur, pendingEur: sum('pendingEur'), paidEur, balanceEur: Math.max(0, round(dueEur - paidEur)), advanceEur: Math.max(0, round(paidEur - dueEur)) } }
}

/**
 * La vue partagée : exactement ce que le créateur voit par son lien, et ce que l'admin voit en
 * aperçu. Construite champ par champ à partir d'agrégats ; aucun identifiant de personne, aucun
 * contenu, aucun coût interne, aucun texte du manifeste hormis nom, accroche et logo.
 */
export interface PublicStats {
  name: string
  tagline: string
  brand: { from: string; to: string; glyph: string; image?: string }
  status: CreatorAppStatus
  sharePercent: number
  stats: CreatorStats
  funnel: { started: number; onboarded: number; firstMessage: number; threeMessages: number; subscribed: number }
  cohorts: { week: string; signups: number; d1: number | null; d7: number | null; d30: number | null }[]
  money: { months: MonthRow[]; totals: MoneyTotals }
  updatedAt: string
}

export const PUBLIC_STATS_KEYS = ['name', 'tagline', 'brand', 'status', 'sharePercent', 'stats', 'funnel', 'cohorts', 'money', 'updatedAt'] as const

const HEX = /^#[0-9a-f]{6}$/i
const text = (v: unknown, locale: Locale): string => (typeof v === 'string' ? v : v && typeof v === 'object' ? pick(v as LocalizedText, locale) : '')

export function buildPublicStats(input: {
  app: { slug: string; status: CreatorAppStatus; sharePercent: number; manifest: AppManifestInput }
  stats: CreatorStats
  funnel: FunnelRow | undefined
  cohorts: Cohort[]
  payments: CreatorPayment[]
  payouts: PayoutLike[]
  now: Date
  locale: Locale
}): PublicStats {
  const m = input.app.manifest
  const brand = m.brand
  const name = text(m.name, input.locale) || input.app.slug
  const f = input.funnel
  return {
    name,
    tagline: text(m.tagline, input.locale),
    brand: {
      from: brand?.from && HEX.test(brand.from) ? brand.from : '#5E5CE6',
      to: brand?.to && HEX.test(brand.to) ? brand.to : '#3F3DB8',
      glyph: (brand?.glyph ?? name.slice(0, 1)).slice(0, 2) || 'A',
      ...(typeof brand?.image === 'string' && BRAND_IMAGE_RE.test(brand.image) ? { image: brand.image } : {}),
    },
    status: input.app.status,
    sharePercent: input.app.sharePercent,
    stats: { onboarded: input.stats.onboarded, active7d: input.stats.active7d, active30d: input.stats.active30d, messages7d: input.stats.messages7d, messages30d: input.stats.messages30d },
    funnel: { started: f?.started ?? 0, onboarded: f?.onboarded ?? 0, firstMessage: f?.firstMessage ?? 0, threeMessages: f?.threeMessages ?? 0, subscribed: f?.subscribed ?? 0 },
    cohorts: input.cohorts.map((c) => ({
      week: c.week,
      signups: c.signups,
      d1: c.eligibleD1 && c.signups ? c.d1 / c.signups : null,
      d7: c.eligibleD7 && c.signups ? c.d7 / c.signups : null,
      d30: c.eligibleD30 && c.signups ? c.d30 / c.signups : null,
    })),
    money: monthlyEarnings({ payments: input.payments, payouts: input.payouts, sharePercent: input.app.sharePercent, now: input.now }),
    updatedAt: input.now.toISOString(),
  }
}
