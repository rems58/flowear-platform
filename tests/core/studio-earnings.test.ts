import { describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { computeAffiliateStats } from '@/core/growth/affiliates'
import { NET_RATIO, toolRequestSchema } from '@/core/studio/economics'
import { monthlyEarnings } from '@/core/studio/creator-stats'
import { saveCreatorDraft } from '@/core/studio/draft'
import { createToolRequest, creatorDashboard } from '@/core/studio/dashboard'

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
const now = new Date('2026-10-01T00:00:00Z')
const days = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

describe('gains d’un créateur', () => {
  it('la part se calcule sur le net réel, due après trente jours, en attente avant', () => {
    const out = monthlyEarnings({ sharePercent: 50, now, payouts: [], payments: [
      { userId: 'a', amountCents: 900, createdAt: days(40) },
      { userId: 'a', amountCents: 900, createdAt: days(10) },
      { userId: 'b', amountCents: 450, createdAt: days(5) },
      { userId: 'c', amountCents: 0, createdAt: days(50) },
    ] }).totals
    expect(out.payingUsers).toBe(2)
    expect(out.grossEur).toBe(22.5)
    expect(out.netEur).toBe(Math.round(22.5 * NET_RATIO * 100) / 100)
    expect(out.dueEur).toBe(Math.round(9 * NET_RATIO * 0.5 * 100) / 100)
    expect(out.pendingEur).toBe(Math.round(13.5 * NET_RATIO * 0.5 * 100) / 100)
    expect(out.shareEur).toBe(Math.round((out.dueEur + out.pendingEur) * 100) / 100)
  })

  it('le tableau de bord ne sort que des chiffres agrégés, jamais un identifiant ni un contenu', async () => {
    const { repo } = createMemoryRepo()
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest, knowledge: [] })
    await repo.creatorApps.publish('sommeil', 'admin', { sharePercent: 50 })
    await repo.profiles.upsert('u1', 'sommeil', { babyAge: '6 mois' }, 'active')
    await repo.profiles.upsert('u2', 'sommeil', { babyAge: '1 an' }, 'active')
    await repo.usage.record({ userId: 'u1', appSlug: 'sommeil', conversationId: null, provider: 'groq', model: 'm', inputTokens: 10, outputTokens: 5, costUsd: 0.001, durationMs: 100 })
    await repo.events.track({ name: 'payment', userId: 'u1', appSlug: 'sommeil', props: { amountCents: 900 } })
    await repo.events.track({ name: 'payment', userId: 'u9', appSlug: 'amorce', props: { amountCents: 900 } })
    const board = await creatorDashboard(repo, 'c1', new Date())
    expect(board).not.toBeNull()
    expect(board!.stats.onboarded).toBe(2)
    expect(board!.stats.active7d).toBe(1)
    expect(board!.stats.messages30d).toBe(1)
    expect(board!.earnings.payingUsers).toBe(1)
    expect(board!.earnings.grossEur).toBe(9)
    expect(board!.sharePercent).toBe(50)
    // Les versements enregistrés comptent aussi dans l'espace créateur, comme sur la page partagée.
    expect(board!.earnings.paidEur).toBe(0)
    expect(JSON.stringify(board)).not.toContain('u1')
    expect(JSON.stringify(board)).not.toContain('6 mois')
    // Un autre créateur n'a rien.
    expect(await creatorDashboard(repo, 'c2', new Date())).toBeNull()
  })

  it('une demande d’outil est attachée à sa propre IA seulement', async () => {
    const { repo } = createMemoryRepo()
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest, knowledge: [] })
    expect(toolRequestSchema.safeParse({ title: 'Ok', body: 'court' }).success).toBe(false)
    const created = await createToolRequest(repo, 'c1', { title: 'Journal de nuit', body: 'Noter chaque réveil avec l’heure, pour voir la semaine.' })
    expect(created.slug).toBe('sommeil')
    expect(created.status).toBe('open')
    await expect(createToolRequest(repo, 'c2', { title: 'Journal de nuit', body: 'Noter chaque réveil avec l’heure, pour voir la semaine.' })).rejects.toThrow('not_found')
    await repo.toolRequests.setStatus(created.id, 'planned')
    expect((await repo.toolRequests.listBySlug('sommeil'))[0].status).toBe('planned')
  })

  it('un affilié limité à une IA ne compte que ses inscriptions et ses paiements', () => {
    const base = { name: 'x', contact: null, payoutEur: 0, percent: 50, months: null, createdAt: days(100) }
    const rows = computeAffiliateStats({
      now,
      affiliates: [{ ...base, code: 'sommeil', appSlug: 'sommeil' }, { ...base, code: 'tous', appSlug: null }],
      onboardings: [
        { userId: 'a', ref: 'sommeil', createdAt: days(60), appSlug: 'sommeil' },
        { userId: 'b', ref: 'sommeil', createdAt: days(60), appSlug: 'amorce' },
        { userId: 'c', ref: 'tous', createdAt: days(60), appSlug: 'amorce' },
      ],
      subscriptions: [{ userId: 'a', firstPaidAt: days(50) }, { userId: 'b', firstPaidAt: days(50) }, { userId: 'c', firstPaidAt: days(50) }],
      payments: [
        { userId: 'a', amountCents: 900, createdAt: days(50), appSlug: 'sommeil' },
        { userId: 'a', amountCents: 900, createdAt: days(45), appSlug: 'flowear' },
        { userId: 'b', amountCents: 900, createdAt: days(50), appSlug: 'amorce' },
        { userId: 'c', amountCents: 900, createdAt: days(50), appSlug: 'amorce' },
      ],
    })
    const limited = rows.find((r) => r.code === 'sommeil')!
    expect(limited.signups).toBe(1)
    expect(limited.revenueEur).toBe(9)
    const open = rows.find((r) => r.code === 'tous')!
    expect(open.signups).toBe(1)
    expect(open.revenueEur).toBe(9)
  })

  it('le reste à verser ne devient jamais négatif ; un versement en avance est compté à part', () => {
    const out = monthlyEarnings({ sharePercent: 50, now, payments: [{ userId: 'a', amountCents: 900, createdAt: days(40) }, { userId: 'b', amountCents: 900, createdAt: days(5) }], payouts: [{ amountCents: 1000, paidAt: '2026-09-30' }] })
    expect(out.totals.balanceEur).toBe(0)
    expect(out.totals.advanceEur).toBe(Math.round((10 - 9 * NET_RATIO * 0.5) * 100) / 100)
    expect(out.totals.payingUsers).toBe(2)
  })

  it('l’espace créateur soustrait les versements enregistrés', async () => {
    const { repo } = createMemoryRepo()
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest, knowledge: [] })
    await repo.events.track({ name: 'payment', userId: 'u1', appSlug: 'sommeil', props: { amountCents: 900 } })
    await repo.creatorPayouts.create({ slug: 'sommeil', amountCents: 100, paidAt: '2026-09-01', note: null, createdBy: 'admin' })
    const board = await creatorDashboard(repo, 'c1', new Date(Date.now() + 40 * 86_400_000))
    expect(board!.earnings.paidEur).toBe(1)
    expect(board!.earnings.balanceEur).toBe(Math.round((9 * NET_RATIO * 0.5 - 1) * 100) / 100)
  })
})
