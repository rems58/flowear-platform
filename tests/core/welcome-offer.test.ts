import { describe, expect, it } from 'vitest'
import { remyApp } from '@/apps/remy/manifest'
import { currentOfferFor, discountedPrice, promoOfferFor, welcomeOfferFor } from '@/core/billing/welcome-offer'
import { resolveConfig } from '@/core/config/resolve'
import type { User } from '@/core/data/types'

// Le mécanisme se teste allumé (72 h), comme quand il est rallumé depuis l'admin.
const config = resolveConfig(remyApp, [{ scope: 'all', key: 'offers.welcome.hours', value: 72 }])
const user = (over: Partial<User> = {}): User => ({ clerkUserId: 'u', email: null, locale: 'fr', stripeCustomerId: null, digestEnabled: true, lastDigestAt: null, tester: false, creator: false, quotaResetAt: null, welcomeOfferUsedAt: null, deletedAt: null, purgedAt: null, createdAt: '2026-09-18T10:00:00Z', ...over })

describe('offre de bienvenue : moitié prix le premier mois, 72 h après l’inscription', () => {
  it('est éteinte par défaut depuis le 24/09', () => {
    const off = resolveConfig(remyApp, [])
    expect(off.offers.welcome.hours).toBe(0)
    expect(welcomeOfferFor(user(), off, new Date('2026-09-18T11:00:00Z'), 'free')).toBeNull()
  })

  it('ouverte pendant 72 h, une seule fois, jamais pour un abonné', () => {
    const at = (h: number) => new Date(new Date('2026-09-18T10:00:00Z').getTime() + h * 3_600_000)
    expect(welcomeOfferFor(user(), config, at(1), 'free')).toEqual({ endsAt: '2026-09-21T10:00:00.000Z', percentOff: 50, source: 'welcome' })
    expect(welcomeOfferFor(user(), config, at(71), 'free')).not.toBeNull()
    expect(welcomeOfferFor(user(), config, at(72), 'free')).toBeNull()
    expect(welcomeOfferFor(user({ welcomeOfferUsedAt: '2026-09-18T11:00:00Z' }), config, at(1), 'free')).toBeNull()
    expect(welcomeOfferFor(user(), config, at(1), 'paid')).toBeNull()
    expect(welcomeOfferFor(null, config, at(1), 'free')).toBeNull()
  })

  it('s éteint par réglage, et le prix remisé tombe juste', () => {
    const off = resolveConfig(remyApp, [{ scope: 'all', key: 'offers.welcome.hours', value: 0 }])
    expect(welcomeOfferFor(user(), off, new Date('2026-09-18T11:00:00Z'), 'free')).toBeNull()
    expect(discountedPrice(9, 50)).toBe(4.5)
    expect(discountedPrice(30, 50)).toBe(15)
  })
})

describe('fenêtre promo ouverte par l admin', () => {
  it('vaut pour tout gratuit entre deux dates, même après l offre de bienvenue, jamais pour un abonné', () => {
    const cfg = resolveConfig(remyApp, [{ scope: 'all', key: 'offers.welcome.hours', value: 72 }, { scope: 'all', key: 'offers.promo', value: { from: '2026-10-01T00:00:00.000Z', until: '2026-10-03T00:00:00.000Z' } }])
    const inside = new Date('2026-10-02T12:00:00Z')
    const used = user({ welcomeOfferUsedAt: '2026-09-18T11:00:00Z' })
    expect(promoOfferFor(cfg, inside, 'free')).toEqual({ endsAt: '2026-10-03T00:00:00.000Z', percentOff: 50, source: 'promo' })
    expect(currentOfferFor(used, cfg, inside, 'free')?.source).toBe('promo')
    expect(promoOfferFor(cfg, new Date('2026-10-03T00:00:00Z'), 'free')).toBeNull()
    expect(promoOfferFor(cfg, inside, 'paid')).toBeNull()
    expect(promoOfferFor(config, inside, 'free')).toBeNull()
    // Dans ses 72 h, la personne voit l'offre de bienvenue, pas la promo.
    expect(currentOfferFor(user(), cfg, new Date('2026-09-18T11:00:00Z'), 'free')?.source).toBe('welcome')
  })
})
