import { describe, expect, it } from 'vitest'
import { affiliateCodeSchema, computeAffiliateStats, PAYOUT_DELAY_DAYS } from '@/core/growth/affiliates'

const DAY = 86_400_000
const now = new Date('2026-10-20T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY).toISOString()

describe('affiliation : attribuer inscriptions et paiements à un créateur', () => {
  it('compte les inscrits, les payants, et ce qui est dû après le délai de rétractation', () => {
    const rows = computeAffiliateStats({
      affiliates: [{ code: 'lea', name: 'Léa', contact: '@lea', payoutEur: 9, percent: null, months: null, createdAt: daysAgo(60), appSlug: null }],
      onboardings: [
        { userId: 'u1', ref: 'lea', createdAt: daysAgo(50), appSlug: null },
        { userId: 'u2', ref: 'lea', createdAt: daysAgo(40), appSlug: null },
        { userId: 'u3', ref: 'lea', createdAt: daysAgo(5), appSlug: null },
        { userId: 'u4', ref: 'autre', createdAt: daysAgo(5), appSlug: null },
      ],
      subscriptions: [
        { userId: 'u1', firstPaidAt: daysAgo(45) },
        { userId: 'u3', firstPaidAt: daysAgo(2) },
      ],
      payments: [],
      now,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ code: 'lea', signups: 3, paying: 2, eligible: 1, dueEur: 9 })
    expect(PAYOUT_DELAY_DAYS).toBe(30)
  })

  it('un paiement n’est attribué qu’une fois, au code de la première inscription', () => {
    const rows = computeAffiliateStats({
      affiliates: [
        { code: 'a', name: 'A', contact: null, payoutEur: 9, percent: null, months: null, createdAt: daysAgo(90), appSlug: null },
        { code: 'b', name: 'B', contact: null, payoutEur: 12, percent: null, months: null, createdAt: daysAgo(90), appSlug: null },
      ],
      onboardings: [
        { userId: 'u1', ref: 'a', createdAt: daysAgo(80), appSlug: null },
        { userId: 'u1', ref: 'b', createdAt: daysAgo(70), appSlug: null },
      ],
      subscriptions: [{ userId: 'u1', firstPaidAt: daysAgo(60) }],
      payments: [],
      now,
    })
    expect(rows.find((r) => r.code === 'a')).toMatchObject({ signups: 1, paying: 1, eligible: 1, dueEur: 9 })
    expect(rows.find((r) => r.code === 'b')).toMatchObject({ signups: 0, paying: 0, eligible: 0, dueEur: 0 })
  })

  it('en pourcentage : une part de chaque paiement réel, pendant N mois, dus après le délai', () => {
    const rows = computeAffiliateStats({
      affiliates: [{ code: 'max', name: 'Max', contact: null, payoutEur: 0, percent: 50, months: 2, createdAt: daysAgo(200), appSlug: null }],
      onboardings: [{ userId: 'u1', ref: 'max', createdAt: daysAgo(150), appSlug: null }],
      subscriptions: [{ userId: 'u1', firstPaidAt: '2026-07-01T10:00:00Z' }],
      payments: [
        { userId: 'u1', amountCents: 450, createdAt: '2026-07-01T10:00:00Z', appSlug: null }, // premier mois à moitié prix
        { userId: 'u1', amountCents: 900, createdAt: '2026-08-01T10:00:00Z', appSlug: null },
        { userId: 'u1', amountCents: 900, createdAt: '2026-09-01T10:00:00Z', appSlug: null }, // troisième mensualité : hors fenêtre de 2 mois
        { userId: 'u1', amountCents: 900, createdAt: '2026-10-01T10:00:00Z', appSlug: null },
      ],
      now,
    })
    // « 2 mois » = les deux premières mensualités, même si Stripe encaisse la troisième quelques heures avant la date pile.
    expect(rows[0]).toMatchObject({ signups: 1, paying: 1, eligible: 1, revenueEur: 13.5, dueEur: 6.75, pendingEur: 0 })
  })

  it('en pourcentage sans limite de mois, un paiement trop récent attend le délai', () => {
    const rows = computeAffiliateStats({
      affiliates: [{ code: 'max', name: 'Max', contact: null, payoutEur: 0, percent: 30, months: null, createdAt: daysAgo(200), appSlug: null }],
      onboardings: [{ userId: 'u1', ref: 'max', createdAt: daysAgo(150), appSlug: null }],
      subscriptions: [{ userId: 'u1', firstPaidAt: daysAgo(40) }],
      payments: [
        { userId: 'u1', amountCents: 900, createdAt: daysAgo(40), appSlug: null },
        { userId: 'u1', amountCents: 900, createdAt: daysAgo(10), appSlug: null },
      ],
      now,
    })
    expect(rows[0]).toMatchObject({ revenueEur: 18, dueEur: 2.7, pendingEur: 2.7 })
  })

  it('le code est court, en minuscules, sans caractère bizarre', () => {
    expect(affiliateCodeSchema.safeParse('lea').success).toBe(true)
    expect(affiliateCodeSchema.safeParse('lea-tdah2').success).toBe(true)
    expect(affiliateCodeSchema.safeParse('Léa').success).toBe(false)
    expect(affiliateCodeSchema.safeParse('a').success).toBe(false)
    expect(affiliateCodeSchema.safeParse('x'.repeat(33)).success).toBe(false)
  })
})
