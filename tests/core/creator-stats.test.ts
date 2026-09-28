import { describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { NET_RATIO } from '@/core/studio/economics'
import { monthlyEarnings, buildPublicStats, PUBLIC_STATS_KEYS } from '@/core/studio/creator-stats'
import { hashShareToken, isShareTokenFormat, newShareToken } from '@/core/studio/share-token'
import { saveCreatorDraft } from '@/core/studio/draft'

const L = (fr: string, en = fr) => ({ en, fr, es: en, de: en, it: en })
const manifest = {
  slug: 'sommeil',
  name: 'Sommeil',
  tagline: L('Un coach sommeil.'),
  persona: { system: 'Tu es Sommeil, un coach pour jeunes parents fatigués. Tu poses une seule question à la fois, tu proposes un geste concret pour la nuit qui vient, et tu ne donnes jamais de conseil médical : si la question relève d’un médecin, tu le dis en une phrase.' },
  onboarding: { questions: [{ type: 'text', key: 'babyAge', label: L('Âge du bébé ?') }] },
  tools: { enabled: ['save_profile'] },
  pwa: { shortName: 'Sommeil', themeColor: '#5E5CE6', backgroundColor: '#ffffff' },
}
const now = new Date('2026-11-15T12:00:00Z')
const round = (n: number) => Math.round(n * 100) / 100

describe('revenus d’une IA créateur, mois par mois', () => {
  it('regroupe par mois, sépare dû et en attente, et soustrait les versements', () => {
    const out = monthlyEarnings({
      sharePercent: 50,
      now,
      payments: [
        { userId: 'a', amountCents: 900, createdAt: '2026-09-10T10:00:00Z' },
        { userId: 'b', amountCents: 900, createdAt: '2026-09-20T10:00:00Z' },
        { userId: 'a', amountCents: 900, createdAt: '2026-10-10T10:00:00Z' },
        { userId: 'a', amountCents: 900, createdAt: '2026-11-10T10:00:00Z' },
      ],
      payouts: [{ amountCents: 500, paidAt: '2026-10-31' }],
    })
    expect(out.months.map((m) => m.month)).toEqual(['2026-11', '2026-10', '2026-09'])
    const sept = out.months.find((m) => m.month === '2026-09')!
    expect(sept.grossEur).toBe(18)
    expect(sept.payingUsers).toBe(2)
    expect(sept.shareEur).toBe(round(18 * NET_RATIO * 0.5))
    expect(sept.pendingEur).toBe(0)
    const nov = out.months.find((m) => m.month === '2026-11')!
    expect(nov.dueEur).toBe(0)
    expect(nov.pendingEur).toBe(round(9 * NET_RATIO * 0.5))
    expect(out.totals.paidEur).toBe(5)
    expect(out.totals.balanceEur).toBe(round(out.totals.dueEur - 5))
  })
})

describe('vue partagée des statistiques', () => {
  it('ne contient que des agrégats : aucune clé hors liste, aucun identifiant, aucune donnée de profil', async () => {
    const view = buildPublicStats({
      app: { slug: 'sommeil', status: 'published', sharePercent: 50, manifest: manifest as never },
      stats: { onboarded: 4, active7d: 2, active30d: 3, messages7d: 10, messages30d: 40 },
      funnel: { appSlug: 'sommeil', started: 6, onboarded: 4, firstMessage: 3, threeMessages: 2, subscribed: 1 },
      cohorts: [{ week: '2026-11-02', appSlug: 'sommeil', signups: 3, d1: 2, d7: 1, d30: 0, eligibleD1: true, eligibleD7: true, eligibleD30: false }],
      payments: [{ userId: 'user_secret_123', amountCents: 900, createdAt: '2026-09-10T10:00:00Z' }],
      payouts: [],
      now,
      locale: 'fr',
    })
    expect(Object.keys(view).sort()).toEqual([...PUBLIC_STATS_KEYS].sort())
    const json = JSON.stringify(view)
    expect(json).not.toContain('user_secret_123')
    expect(json).not.toContain('persona')
    expect(json).not.toContain('Tu es Sommeil')
    expect(view.cohorts[0]).toEqual({ week: '2026-11-02', signups: 3, d1: 2 / 3, d7: 1 / 3, d30: null })
    expect(view.money.totals.grossEur).toBe(9)
  })
})

describe('jeton de partage', () => {
  it('est long, aléatoire, et seule son empreinte est gardée', async () => {
    const a = newShareToken()
    const b = newShareToken()
    expect(a).not.toBe(b)
    expect(isShareTokenFormat(a)).toBe(true)
    expect(isShareTokenFormat('court')).toBe(false)
    expect(isShareTokenFormat(a + '/../admin')).toBe(false)
    expect(await hashShareToken(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashShareToken(a)).not.toContain(a)

    const { repo } = createMemoryRepo()
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest, knowledge: [] })
    await repo.creatorApps.setShareToken('sommeil', await hashShareToken(a))
    expect((await repo.creatorApps.getByShareTokenHash(await hashShareToken(a)))?.slug).toBe('sommeil')
    expect(await repo.creatorApps.getByShareTokenHash(await hashShareToken(b))).toBeNull()
    // Régénérer ou révoquer rend l'ancien lien mort.
    await repo.creatorApps.setShareToken('sommeil', null)
    expect(await repo.creatorApps.getByShareTokenHash(await hashShareToken(a))).toBeNull()
  })

  it('les versements s’enregistrent par IA', async () => {
    const { repo } = createMemoryRepo()
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest, knowledge: [] })
    await repo.creatorPayouts.create({ slug: 'sommeil', amountCents: 1200, paidAt: '2026-10-31', note: 'virement octobre', createdBy: 'admin' })
    const list = await repo.creatorPayouts.list('sommeil')
    expect(list).toHaveLength(1)
    expect(list[0].amountCents).toBe(1200)
    expect(await repo.creatorPayouts.list('autre')).toEqual([])
  })
})
