import { beforeEach, describe, expect, it } from 'vitest'
import { remyApp } from '@/apps/remy/manifest'
import { checkDailyQuota, quotaWindowStart, resolveAccess, resolvePlan } from '@/core/billing/entitlements'
import { computeStatuses } from '@/core/billing/statuses'
import { PRICES } from '@/core/billing/prices'
import { resolveConfig } from '@/core/config/resolve'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { buildDigest, isEmptyDigest } from '@/core/digest/build'
import { renderDigest } from '@/core/digest/render'
import { ensureToolsRegistered, resetTools, resolveTools, toAiToolSet } from '@/core/tools'
import type { ToolContext } from '@/core/tools/types'
import { getMessages } from '@/lib/i18n/messages'

const config = resolveConfig(remyApp)
const now = new Date('2026-09-16T12:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString()

describe('semaine d’accueil', () => {
  it('une ligne trialing ouvre le plan payant jusqu’à sa fin, sans grâce', () => {
    const running = [{ userId: 'u', appSlug: 'remy', status: 'trialing', currentPeriodEnd: days(3) }]
    expect(resolvePlan(running, 'remy', now)).toBe('paid')
    expect(resolveAccess(running, 'remy', now)).toMatchObject({ plan: 'paid', trialEndsAt: days(3), trialEndedRecently: false })
    const ended = [{ userId: 'u', appSlug: 'remy', status: 'trialing', currentPeriodEnd: days(-1) }]
    expect(resolvePlan(ended, 'remy', now)).toBe('free')
    expect(resolveAccess(ended, 'remy', now)).toMatchObject({ plan: 'free', trialEndsAt: null, trialEndedRecently: true })
    const old = [{ userId: 'u', appSlug: 'remy', status: 'trialing', currentPeriodEnd: days(-30) }]
    expect(resolveAccess(old, 'remy', now).trialEndedRecently).toBe(false)
    // past_due garde trois jours de grâce, pas plus.
    expect(resolvePlan([{ userId: 'u', appSlug: 'remy', status: 'past_due', currentPeriodEnd: days(-2) }], 'remy', now)).toBe('paid')
    expect(resolvePlan([{ userId: 'u', appSlug: 'remy', status: 'past_due', currentPeriodEnd: days(-4) }], 'remy', now)).toBe('free')
  })

  it('une seule semaine par compte, sur le bundle : elle ouvre toutes les IA', async () => {
    const { repo } = createMemoryRepo()
    expect(await repo.subscriptions.startTrial('u', 'flowear', new Date(days(7)))).toBe(true)
    expect(await repo.subscriptions.startTrial('u', 'flowear', new Date(days(7)))).toBe(false)
    const subs = await repo.subscriptions.listActive('u')
    expect(resolvePlan(subs, 'remy', now)).toBe('paid')
    expect(resolvePlan(subs, 'teinty', now)).toBe('paid')
    expect(resolveAccess(subs, 'teinty', now).trialEndsAt).toBe(days(7))
    // Retirée le 18/09 : zéro jour par défaut, le mécanisme reste réglable à chaud.
    expect(config.trial.days).toBe(0)
  })
})

describe('garde-fous par plan', () => {
  it('gratuit permanent (18/09) : 5 messages par jour, une production par mois, un rappel ; abonné borné aussi', () => {
    expect(config.plans.free.messagesPerDay).toBe(5)
    expect(config.plans.free.artifactsPerMonth).toBe(1)
    expect(config.plans.free.checkinsActive).toBe(1)
    expect(config.plans.free.assessmentRetake).toBe(false)
    expect(checkDailyQuota({ plan: 'free', config, messagesToday: 5, messagesMonth: 5, costTodayUsd: 0 })).toMatchObject({ allowed: false, reason: 'messages' })
    expect(checkDailyQuota({ plan: 'free', config, messagesToday: 4, messagesMonth: 4, costTodayUsd: 0 }).allowed).toBe(true)
    expect(config.plans.paid.messagesPerDay).toBeLessThanOrEqual(150)
    expect(config.plans.paid.maxUsdPerMonth).toBeLessThanOrEqual(5)
    expect(checkDailyQuota({ plan: 'paid', config, messagesToday: 150, costTodayUsd: 0 })).toMatchObject({ allowed: false, reason: 'messages' })
    expect(checkDailyQuota({ plan: 'paid', config, messagesToday: 1, costTodayUsd: 0, costMonthUsd: 5 })).toMatchObject({ allowed: false, reason: 'cost_month' })
    expect(checkDailyQuota({ plan: 'paid', config, messagesToday: 1, costTodayUsd: 0, costMonthUsd: 1 }).allowed).toBe(true)
  })

  it('prix : 9 € par IA, 30 € le bundle, annuel = dix mois', () => {
    expect(PRICES.app).toEqual({ monthly: 9, yearly: 90 })
    expect(PRICES.bundle).toEqual({ monthly: 30, yearly: 300 })
  })
})

describe('productions par mois', () => {
  beforeEach(() => resetTools())

  function ctxFor(plan: 'free' | 'paid', limits?: ToolContext['limits']) {
    const { repo, state } = createMemoryRepo()
    const ctx: ToolContext = { userId: 'u', appSlug: 'remy', conversationId: null, locale: 'fr', plan, profile: {}, repo, now: () => now, knowledge: [], limits }
    return { ctx, state }
  }
  const fiche = { title: 'Courir 10 km', goal: 'Finir', steps: [{ title: 'a', detail: 'b' }, { title: 'c', detail: 'd' }] }

  it('au-delà de la borne du mois, la fiche est refusée avec une explication pour le modèle', async () => {
    ensureToolsRegistered()
    const { ctx, state } = ctxFor('free', { artifactsPerMonth: 3 })
    const set = toAiToolSet(resolveTools(config, 'free'), ctx, { maxOutputChars: 5000 })
    const run = (i: unknown) => (set.create_fiche as { execute: (a: unknown, b: unknown) => Promise<unknown> }).execute(i, { toolCallId: 'c', messages: [] })
    for (let i = 0; i < 3; i++) expect((await run(fiche)) as { artifactId?: string }).toHaveProperty('artifactId')
    const fourth = (await run(fiche)) as { error?: string }
    expect(fourth.error).toMatch(/gratuit/)
    expect(state.artifacts.size).toBe(3)
    // Gratuit : une production par mois, la seconde est refusée avec la mention de l'abonnement.
    const { ctx: wall, state: wallState } = ctxFor('free', { artifactsPerMonth: config.plans.free.artifactsPerMonth })
    const wallSet = toAiToolSet(resolveTools(config, 'free'), wall, { maxOutputChars: 5000 })
    const runWall = () => (wallSet.create_fiche as { execute: (a: unknown, b: unknown) => Promise<unknown> }).execute(fiche, { toolCallId: 'c', messages: [] })
    expect((await runWall()) as { artifactId?: string }).toHaveProperty('artifactId')
    const second = (await runWall()) as { error?: string }
    expect(second.error).toMatch(/gratuit/)
    expect(wallState.artifacts.size).toBe(1)
    expect(state.events.some((e) => e.name === 'quota_hit' && e.props?.reason === 'artifacts')).toBe(true)
  })

  it('sans borne (tests, admin), rien ne bloque', async () => {
    ensureToolsRegistered()
    const { ctx } = ctxFor('paid')
    const set = toAiToolSet(resolveTools(config, 'paid'), ctx, { maxOutputChars: 5000 })
    const run = (i: unknown) => (set.create_fiche as { execute: (a: unknown, b: unknown) => Promise<unknown> }).execute(i, { toolCallId: 'c', messages: [] })
    for (let i = 0; i < 5; i++) expect((await run(fiche)) as { artifactId?: string }).toHaveProperty('artifactId')
  })
})

describe('statuts', () => {
  it('profil complet dès l’onboarding, habitué après sept jours distincts, dans la langue de la personne', () => {
    expect(computeStatuses(remyApp, { onboardingDone: true, activeDays: 2, artifacts: 0 }, 'fr').map((s) => s.label)).toEqual(['Profil complet'])
    expect(computeStatuses(remyApp, { onboardingDone: true, activeDays: 7, artifacts: 0 }, 'de').map((s) => s.label)).toEqual(['Profil vollständig', 'Stammnutzer'])
  })

  it('les jours actifs se comptent par jour civil distinct', async () => {
    const { repo } = createMemoryRepo()
    const base = { userId: 'u', appSlug: 'remy', provider: 'groq', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, durationMs: 1 }
    await repo.usage.record(base)
    await repo.usage.record(base)
    expect(await repo.usage.activeDays('u', 'remy', new Date(0))).toBe(1)
  })
})

describe('digest hebdomadaire', () => {
  it('vide sans activité, sinon souvenirs et productions par IA, email échappé et traduit', async () => {
    const { repo } = createMemoryRepo()
    const since = new Date(Date.now() - 7 * 86_400_000)
    expect(isEmptyDigest(await buildDigest(repo, 'u', [remyApp], 'fr', since))).toBe(true)
    await repo.profiles.upsert('u', 'remy', { firstName: 'Ana' }, 'active')
    await repo.notes.add('u', 'remy', 'Se lève à 8h <script>', 'auto')
    await repo.artifacts.create({ userId: 'u', appSlug: 'remy', type: 'fiche', title: 'Courir & respirer', data: {} })
    await repo.usage.record({ userId: 'u', appSlug: 'remy', provider: 'groq', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, durationMs: 1 })
    const digest = await buildDigest(repo, 'u', [remyApp], 'es', since)
    expect(digest.apps).toHaveLength(1)
    expect(digest).toMatchObject({ totalNotes: 1, totalArtifacts: 1, totalMessages: 1 })
    const mail = renderDigest(digest, getMessages('es'), { appUrl: 'https://flowear.app', unsubscribeUrl: 'https://flowear.app/api/digest/unsubscribe?u=u&t=x' })
    expect(mail.subject).toBe('Esta semana: 1 cosas recordadas, 1 cosas creadas para ti')
    expect(mail.html).toContain('&lt;script&gt;')
    expect(mail.html).toContain('Courir &amp; respirer')
    expect(mail.html).toContain('https://flowear.app/remy')
    expect(mail.text).toContain('Guía práctica : Courir & respirer')
    expect(mail.text).toContain('unsubscribe')
  })
})

describe('fin de semaine d’accueil et abonnés', () => {
  it('un abonné payant ne voit pas le bandeau de la semaine, même si sa ligne d’essai court encore', () => {
    const subs = [
      { userId: 'u', appSlug: 'flowear', status: 'trialing', currentPeriodEnd: days(5) },
      { userId: 'u', appSlug: 'remy', status: 'active', currentPeriodEnd: days(30) },
    ]
    expect(resolveAccess(subs, 'remy', now)).toMatchObject({ plan: 'paid', trialEndsAt: null, freeSince: null })
    // Sur une autre IA, seule la semaine ouvre l'accès : le bandeau y reste légitime.
    expect(resolveAccess(subs, 'teinty', now).trialEndsAt).toBe(days(5))
  })

  it('la fenêtre de quota du gratuit commence à la fin de la semaine, jamais avant', () => {
    const ended = [{ userId: 'u', appSlug: 'flowear', status: 'trialing', currentPeriodEnd: days(-2) }]
    const access = resolveAccess(ended, 'remy', now)
    expect(access).toMatchObject({ plan: 'free', freeSince: days(-2) })
    const monthStart = new Date('2026-09-01T00:00:00Z')
    expect(quotaWindowStart(access, monthStart).toISOString()).toBe(days(-2))
    // Fin d'essai le mois précédent : le 1er du mois reste la borne.
    const old = resolveAccess([{ userId: 'u', appSlug: 'flowear', status: 'trialing', currentPeriodEnd: '2026-08-20T00:00:00.000Z' }], 'remy', now)
    expect(quotaWindowStart(old, monthStart)).toEqual(monthStart)
    expect(quotaWindowStart({ freeSince: null }, monthStart)).toEqual(monthStart)
  })

  it('les candidats au digest jamais servis passent en premier', async () => {
    const { repo } = createMemoryRepo()
    await repo.users.upsert({ clerkUserId: 'a', email: 'a@x.test' })
    await repo.users.upsert({ clerkUserId: 'b', email: 'b@x.test' })
    await repo.users.markDigestSent('a', new Date(days(-10)))
    const list = await repo.users.listDigestCandidates(new Date(days(-6)), 10)
    expect(list.map((u) => u.clerkUserId)).toEqual(['b', 'a'])
  })
})
