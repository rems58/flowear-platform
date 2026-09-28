import { describe, expect, it } from 'vitest'
import { remyApp } from '@/apps/remy/manifest'
import { defineApp } from '@/apps/types'
import { killVerdict } from '@/core/admin/kill'
import { ADMIN_PUSH_SLUG } from '@/core/admin/constants'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { reportBodySchema, reportPatchSchema, reviewSeverity, severityFor } from '@/core/reports/schema'
import { getApp } from '@/apps/registry'

const now = new Date('2026-10-20T12:00:00Z')
const weeksAgo = (n: number) => new Date(now.getTime() - n * 7 * 86_400_000)

describe('signalements', () => {
  it('un avis porte une note de 1 à 5, le texte est facultatif, une ou deux étoiles réclament un œil', () => {
    expect(reportBodySchema.safeParse({ kind: 'review', rating: 4 }).success).toBe(true)
    expect(reportBodySchema.safeParse({ kind: 'review', rating: 2, body: 'Trop lent' }).success).toBe(true)
    expect(reportBodySchema.safeParse({ kind: 'review', rating: 0 }).success).toBe(false)
    expect(reportBodySchema.safeParse({ kind: 'review', rating: 6 }).success).toBe(false)
    expect(reportBodySchema.safeParse({ kind: 'review', rating: 3.5 }).success).toBe(false)
    expect(reviewSeverity(1)).toBe('medium')
    expect(reviewSeverity(2)).toBe('medium')
    expect(reviewSeverity(3)).toBe('low')
    expect(reviewSeverity(5)).toBe('low')
  })

  it('déduit la gravité de la catégorie : la personne ne la choisit pas', () => {
    expect(severityFor('dangerous')).toBe('high')
    expect(severityFor('inappropriate')).toBe('high')
    expect(severityFor('payment')).toBe('high')
    expect(severityFor('false')).toBe('medium')
    expect(severityFor('bug')).toBe('medium')
    expect(severityFor('question')).toBe('low')
    expect(severityFor('other')).toBe('low')
    // Une catégorie inconnue ne crie jamais.
    expect(severityFor('n_importe_quoi')).toBe('low')
  })

  it('accepte les deux formes et refuse le reste', () => {
    expect(reportBodySchema.safeParse({ kind: 'message', messageId: 'msg_abcd1234', category: 'false' }).success).toBe(true)
    expect(reportBodySchema.safeParse({ kind: 'contact', category: 'bug', body: 'Le bouton ne répond pas.' }).success).toBe(true)
    // Un message libre trop court ne dit rien.
    expect(reportBodySchema.safeParse({ kind: 'contact', category: 'bug', body: 'ok' }).success).toBe(false)
    // Un identifiant de message forgé est rejeté avant même de chercher en base.
    expect(reportBodySchema.safeParse({ kind: 'message', messageId: '../etc', category: 'false' }).success).toBe(false)
    expect(reportBodySchema.safeParse({ kind: 'message', messageId: 'msg_abcd1234', category: 'stripe_dispute' }).success).toBe(false)
    expect(reportPatchSchema.safeParse({ status: 'resolved', resolution: 'Corrigé.' }).success).toBe(true)
    expect(reportPatchSchema.safeParse({ status: 'archived' }).success).toBe(false)
  })

  it('range les plus graves en tête, puis les plus récents', async () => {
    const { repo } = createMemoryRepo()
    await repo.reports.create({ userId: 'u1', appSlug: 'remy', source: 'message', category: 'other', severity: 'low' })
    await repo.reports.create({ userId: 'u1', appSlug: 'remy', source: 'contact', category: 'payment', severity: 'high', body: 'Débité deux fois.' })
    await repo.reports.create({ userId: 'u2', appSlug: 'remy', source: 'message', category: 'false', severity: 'medium' })
    const all = await repo.reports.list({ limit: 10 })
    expect(all.map((r) => r.severity)).toEqual(['high', 'medium', 'low'])
    expect(await repo.reports.list({ status: 'new', limit: 10 })).toHaveLength(3)
  })

  it('résoudre garde la note, qui l’a fait, et quand', async () => {
    const { repo } = createMemoryRepo()
    const r = await repo.reports.create({ userId: 'u1', appSlug: 'remy', source: 'contact', category: 'bug', severity: 'medium', body: 'x' })
    const seen = await repo.reports.setStatus(r.id, 'seen', null, 'admin_1')
    expect(seen?.status).toBe('seen')
    expect(seen?.resolvedAt).toBeNull()
    const done = await repo.reports.setStatus(r.id, 'resolved', 'Corrigé dans la version du soir.', 'admin_1')
    expect(done?.resolution).toBe('Corrigé dans la version du soir.')
    expect(done?.resolvedBy).toBe('admin_1')
    expect(done?.resolvedAt).not.toBeNull()
    expect(await repo.reports.setStatus('inconnu', 'seen', null, 'admin_1')).toBeNull()
  })

  it('le slug des notifications admin n’est porté par aucune IA', () => {
    expect(getApp(ADMIN_PUSH_SLUG)).toBeUndefined()
  })
})

describe('verdict kill ou keep', () => {
  it('reste gris tant qu’aucune cohorte n’a quatorze jours', () => {
    const v = killVerdict(remyApp, { eligible: 0, retainedD7: 0, signups: 12, launchedAt: weeksAgo(1) }, now)
    expect(v.color).toBe('grey')
    expect(v.retentionD7).toBeNull()
  })

  it('est vert quand la rétention J7 tient l’objectif du manifeste', () => {
    // Rémy demande 20 % de rétention J7.
    const v = killVerdict(remyApp, { eligible: 50, retainedD7: 12, signups: 80, launchedAt: weeksAgo(2) }, now)
    expect(v.color).toBe('green')
    expect(v.retentionD7).toBeCloseTo(0.24)
    expect(v.reason).toContain('Ça tient')
  })

  it('est orange en dessous de l’objectif tant que la revue n’est pas due, rouge ensuite', () => {
    // Revue après quatre semaines : lancée il y a deux semaines, il reste du temps.
    const early = killVerdict(remyApp, { eligible: 50, retainedD7: 5, signups: 80, launchedAt: weeksAgo(2) }, now)
    expect(early.color).toBe('orange')
    expect(early.reviewDue).toBe(false)
    // Lancée il y a six semaines : la revue est passée, il faut trancher.
    const late = killVerdict(remyApp, { eligible: 50, retainedD7: 5, signups: 80, launchedAt: weeksAgo(6) }, now)
    expect(late.color).toBe('red')
    expect(late.reviewDue).toBe(true)
    expect(late.reason).toContain('À trancher')
  })

  it('une IA sans critères ne reçoit pas de verdict', () => {
    const app = defineApp({ ...remyApp, slug: 'sans-critere', kill: undefined })
    const v = killVerdict(app, { eligible: 50, retainedD7: 0, signups: 0, launchedAt: weeksAgo(10) }, now)
    expect(v.color).toBe('grey')
    expect(v.reason).toContain('Aucun critère')
  })
})

describe('lot 2 : revenu, actions, réglages', () => {
  it('calcule le revenu mensuel depuis la grille, l’annuel ramené au mois', async () => {
    const { computeRevenue } = await import('@/core/admin/revenue')
    const r = computeRevenue([
      { userId: 'a', appSlug: 'remy', interval: 'month', status: 'active' },
      { userId: 'b', appSlug: 'flowear', interval: 'year', status: 'active' },
      // Périodicité inconnue (ligne d'avant le webhook) : comptée au mensuel, pas ignorée.
      { userId: 'c', appSlug: 'remy', interval: null, status: 'past_due' },
      // Deux abonnements pour la même personne : un seul abonné.
      { userId: 'a', appSlug: 'teinty', interval: 'month', status: 'active' },
    ])
    expect(r.mrr).toBeCloseTo(9 + 300 / 12 + 9 + 9)
    expect(r.subscribers).toBe(3)
    expect(r.arpu).toBeCloseTo(r.mrr / 3)
    expect(r.bundleShare).toBeCloseTo(0.25)
    expect(computeRevenue([]).arpu).toBe(0)
  })

  it('une remise à zéro plus récente que la fenêtre l’emporte, sinon rien ne change', async () => {
    const { quotaSince } = await import('@/core/admin/actions')
    const window = new Date('2026-10-01T00:00:00Z')
    expect(quotaSince(window, null)).toEqual(window)
    expect(quotaSince(window, '2026-09-20T00:00:00Z')).toEqual(window)
    expect(quotaSince(window, '2026-10-15T08:00:00Z')).toEqual(new Date('2026-10-15T08:00:00Z'))
  })

  it('prolonger une semaine finie repart d’aujourd’hui, pas de la fin passée', async () => {
    const { repo } = createMemoryRepo()
    await repo.subscriptions.startTrial('u1', 'flowear', new Date('2026-09-01T00:00:00Z'))
    const now = new Date('2026-10-01T00:00:00Z')
    expect(await repo.subscriptions.extendTrial('u1', 'flowear', 7, now)).toBe(true)
    const [trial] = await repo.subscriptions.listActive('u1')
    expect(trial.currentPeriodEnd).toBe('2026-10-08T00:00:00.000Z')
    // Personne sans semaine d'accueil : rien à prolonger.
    expect(await repo.subscriptions.extendTrial('inconnu', 'flowear', 7, now)).toBe(false)
  })

  it('un mois offert ouvre le plan payant sans bannière de semaine d’accueil', async () => {
    const { resolveAccess } = await import('@/core/billing/entitlements')
    const { repo } = createMemoryRepo()
    const now = new Date('2026-10-01T00:00:00Z')
    await repo.subscriptions.gift('u1', 'flowear', 30, now)
    const access = resolveAccess(await repo.subscriptions.listActive('u1'), 'remy', now)
    expect(access.plan).toBe('paid')
    expect(access.trialEndsAt).toBeNull()
    // Un second cadeau prolonge le premier au lieu d'en créer un autre.
    await repo.subscriptions.gift('u1', 'flowear', 30, now)
    const subs = await repo.subscriptions.listActive('u1')
    expect(subs).toHaveLength(1)
    expect(subs[0].currentPeriodEnd).toBe('2026-11-30T00:00:00.000Z')
  })

  it('l’effacement vide le contenu et anonymise la ligne, l’usage reste', async () => {
    const { repo, state } = createMemoryRepo()
    await repo.users.upsert({ clerkUserId: 'u1', email: 'a@b.fr' })
    await repo.profiles.upsert('u1', 'remy', { firstName: 'A' }, 'active')
    await repo.notes.add('u1', 'remy', 'aime le vélo')
    await repo.usage.record({ userId: 'u1', appSlug: 'remy', provider: 'groq', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.001, durationMs: 10 })
    await repo.users.eraseContent('u1')
    // Le contenu est parti mais l'identité reste : si Clerk échouait, l'admin recommencerait.
    expect((await repo.users.get('u1'))?.email).toBe('a@b.fr')
    await repo.users.anonymize('u1')
    expect((await repo.users.get('u1'))?.email).toBeNull()
    expect(await repo.profiles.get('u1', 'remy')).toBeNull()
    expect(await repo.notes.list('u1', 'remy', 10)).toHaveLength(0)
    expect(state.usage.filter((u) => u.userId === 'u1')).toHaveLength(1)
  })

  it('refuse à blanc un réglage qui casserait la configuration', async () => {
    const { validateSetting } = await import('@/core/admin/settings')
    expect(validateSetting([], { scope: ['remy'], key: 'plans.free.messagesPerDay', value: 5 })).toEqual({ ok: true })
    // Une valeur négative ne passe pas le schéma de configuration.
    const bad = validateSetting([], { scope: ['remy'], key: 'plans.free.messagesPerDay', value: -1 })
    expect(bad.ok).toBe(false)
    // Une clé hors de la liste blanche est refusée dès le schéma d'écriture.
    const { settingWriteSchema } = await import('@/core/admin/settings')
    expect(settingWriteSchema.safeParse({ scope: 'all', key: 'pricing.groq', value: {} }).success).toBe(false)
  })

  it('la suppression exige un email, les autres actions sont bornées', async () => {
    const { accountActionSchema } = await import('@/core/admin/actions')
    expect(accountActionSchema.safeParse({ action: 'delete' }).success).toBe(false)
    expect(accountActionSchema.safeParse({ action: 'delete', confirmEmail: 'a@b.fr' }).success).toBe(true)
    expect(accountActionSchema.safeParse({ action: 'extend_trial', days: 31 }).success).toBe(false)
    expect(accountActionSchema.safeParse({ action: 'extend_trial', days: 7 }).success).toBe(true)
  })
})
