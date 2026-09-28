import { describe, expect, it } from 'vitest'
import { remyApp } from '@/apps/remy/manifest'
import { checkDailyQuota } from '@/core/billing/entitlements'
import { resolveConfig } from '@/core/config/resolve'
import { createMemoryRepo } from '@/core/data/memory-repo'

const config = resolveConfig(remyApp, [])

describe('pub récompensée : messages gagnés par vidéo', () => {
  it('le crédit du jour s ajoute au quota du gratuit, jamais à celui de l abonné', () => {
    expect(checkDailyQuota({ plan: 'free', config, messagesToday: 5, costTodayUsd: 0 })).toMatchObject({ allowed: false, reason: 'messages' })
    expect(checkDailyQuota({ plan: 'free', config, messagesToday: 5, costTodayUsd: 0, bonusMessagesToday: 5 })).toMatchObject({ allowed: true, limit: 10 })
    expect(checkDailyQuota({ plan: 'paid', config, messagesToday: 150, costTodayUsd: 0, bonusMessagesToday: 5 })).toMatchObject({ allowed: false })
  })

  it('un nonce ne se confirme qu une fois, pour sa personne, et dans les dix minutes', async () => {
    const { repo } = createMemoryRepo()
    const day = '2026-09-18'
    await repo.rewards.start({ userId: 'u', appSlug: 'amorce', day, nonce: 'n1', messages: 5 })
    const now = new Date('2026-09-18T12:00:00Z')
    expect(await repo.rewards.grant('n1', 'autre', now, 600_000)).toBeNull()
    expect((await repo.rewards.grant('n1', 'u', now, 600_000))?.status).toBe('granted')
    expect(await repo.rewards.grant('n1', 'u', now, 600_000)).toBeNull()
    expect(await repo.rewards.today('u', 'amorce', day)).toEqual({ videos: 1, messages: 5 })
    // Trop ancien : la ligne a été créée maintenant, on la confirme avec une fenêtre nulle.
    await repo.rewards.start({ userId: 'u', appSlug: 'amorce', day, nonce: 'n2', messages: 5 })
    expect(await repo.rewards.grant('n2', 'u', new Date(Date.now() + 3_600_000), 600_000)).toBeNull()
  })

  it('les réglages de la pub sont modifiables à chaud et éteints par défaut sans régie', () => {
    expect(config.ads).toEqual({ enabled: true, rewardMessages: 5, maxVideosPerDay: 3 })
    expect(resolveConfig(remyApp, [{ scope: 'all', key: 'ads.maxVideosPerDay', value: 0 }]).ads.maxVideosPerDay).toBe(0)
  })
})
