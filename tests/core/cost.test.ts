import { describe, expect, it } from 'vitest'
import { remyApp } from '@/apps/remy/manifest'
import { checkDailyQuota, estimateCostUsd } from '@/core/billing/entitlements'
import { resolveConfig } from '@/core/config/resolve'
import { buildSystemPrompt } from '@/core/memory/system-prompt'
import { INJECTION_RULES } from '@/core/security/prompt-guard'

const config = resolveConfig(remyApp)

describe('maîtrise des coûts', () => {
  it('même modèle pour les deux plans, plafonds de coût plus bas en gratuit', () => {
    expect(config.plans.free.modelTier).toBe('big')
    expect(config.plans.paid.modelTier).toBe('big')
    expect(config.plans.free.maxUsdPerDay).toBeLessThan(config.plans.paid.maxUsdPerDay)
    expect(config.agent.historyWindow).toBeLessThanOrEqual(12)
    expect(config.agent.maxNotesInPrompt).toBeLessThanOrEqual(20)
    expect(config.agent.maxOutputTokens).toBeLessThanOrEqual(2048)
    expect(config.models.order).toEqual(['openrouter', 'groq', 'openai', 'mistral', 'google'])
  })

  it('le plafond de coût du plan bloque avant le garde-fou global', () => {
    const free = checkDailyQuota({ plan: 'free', config, messagesToday: 1, costTodayUsd: config.plans.free.maxUsdPerDay })
    expect(free).toMatchObject({ allowed: false, reason: 'cost' })
    const paid = checkDailyQuota({ plan: 'paid', config, messagesToday: 1, costTodayUsd: config.plans.free.maxUsdPerDay })
    expect(paid.allowed).toBe(true)
    const ceiling = checkDailyQuota({ plan: 'paid', config, messagesToday: 1, costTodayUsd: config.costGuard.maxUsdPerUserPerDay })
    expect(ceiling).toMatchObject({ allowed: false, reason: 'cost' })
  })

  it('un message type coûte moins d’un millième de dollar sur le petit modèle', () => {
    // 2 500 tokens d'entrée, 400 de sortie : le message moyen mesuré sur Rémy.
    expect(estimateCostUsd(config, 'groq', 'openai/gpt-oss-20b', 2500, 400)).toBeLessThan(0.001)
    expect(estimateCostUsd(config, 'openai', 'gpt-5-nano', 2500, 400)).toBeLessThan(0.001)
    expect(estimateCostUsd(config, 'groq', 'openai/gpt-oss-120b', 2500, 400)).toBeLessThan(0.001)
  })

  it('le prompt garde un préfixe stable avant les données de la personne (cache)', () => {
    const a = buildSystemPrompt({ app: remyApp, locale: 'fr', profile: { firstName: 'Ana' }, notes: [], toolNames: ['create_fiche'], plan: 'free' })
    const b = buildSystemPrompt({ app: remyApp, locale: 'fr', profile: { firstName: 'Bob', goal: 'courir' }, notes: [], toolNames: ['create_fiche'], plan: 'free' })
    const cut = a.indexOf('Langue :')
    expect(cut).toBeGreaterThan(500)
    expect(a.slice(0, cut)).toBe(b.slice(0, cut))
    expect(a.indexOf(INJECTION_RULES)).toBeLessThan(a.indexOf('Ana'))
    expect(a.indexOf('Outils disponibles')).toBeLessThan(a.indexOf('Ana'))
  })
})
