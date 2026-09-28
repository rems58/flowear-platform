import { describe, expect, it } from 'vitest'
import { defineApp } from '@/apps/types'
import { DEFAULTS } from '@/core/config/defaults'
import { resolveConfig, deepMerge, setPath, isSettableKey } from '@/core/config/resolve'

const baseApp = defineApp({
  slug: 'test-app',
  name: 'Test',
  tagline: 'Une app de test',
  persona: { system: 'Tu es un assistant de test qui répond court.' },
  onboarding: { questions: [{ type: 'text', key: 'firstName', label: 'Prénom ?' }] },
  tools: { enabled: ['create_fiche', 'save_profile', 'recall_notes'] },
  pwa: { shortName: 'Test', themeColor: '#000000', backgroundColor: '#ffffff' },
})

describe('deepMerge / setPath', () => {
  it('fusionne les objets et remplace les tableaux', () => {
    const out = deepMerge({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] } })
    expect(out).toEqual({ a: { b: 1, c: [3] }, d: 1 })
  })
  it('pose une valeur à un chemin pointé sans muter la source', () => {
    const src = { agent: { maxSteps: 5, temperature: 0.6 } }
    const out = setPath(src, 'agent.maxSteps', 3) as typeof src
    expect(out.agent.maxSteps).toBe(3)
    expect(out.agent.temperature).toBe(0.6)
    expect(src.agent.maxSteps).toBe(5)
  })
})

describe('resolveConfig : trois couches', () => {
  it('applique les défauts globaux et les tools du manifeste', () => {
    const cfg = resolveConfig(baseApp)
    expect(cfg.slug).toBe('test-app')
    expect(cfg.agent.maxSteps).toBe(DEFAULTS.agent.maxSteps)
    expect(cfg.tools.enabled).toEqual(['create_fiche', 'save_profile', 'recall_notes'])
    expect(cfg.plans.free.messagesPerDay).toBe(DEFAULTS.plans.free.messagesPerDay)
  })

  it('le manifeste surcharge les défauts (config et plans)', () => {
    const app = defineApp({ ...baseApp, config: { agent: { maxSteps: 3 } }, plans: { free: { messagesPerDay: 2 } } })
    const cfg = resolveConfig(app)
    expect(cfg.agent.maxSteps).toBe(3)
    expect(cfg.agent.temperature).toBe(DEFAULTS.agent.temperature)
    expect(cfg.plans.free.messagesPerDay).toBe(2)
    expect(cfg.plans.free.webSearch).toBe(false)
  })

  it('un réglage ciblé gagne sur un réglage « all », qui gagne sur le manifeste', () => {
    const app = defineApp({ ...baseApp, config: { agent: { maxSteps: 3 } } })
    const cfg = resolveConfig(app, [
      { scope: ['test-app'], key: 'agent.maxSteps', value: 8 },
      { scope: 'all', key: 'agent.maxSteps', value: 6 },
    ])
    expect(cfg.agent.maxSteps).toBe(8)
  })

  it('un réglage ciblé sur une autre app est ignoré', () => {
    const cfg = resolveConfig(baseApp, [{ scope: ['autre'], key: 'agent.maxSteps', value: 1 }])
    expect(cfg.agent.maxSteps).toBe(DEFAULTS.agent.maxSteps)
  })

  it('tools.disabled s’accumule et retire les tools de la liste activée', () => {
    const cfg = resolveConfig(baseApp, [
      { scope: 'all', key: 'tools.disabled', value: ['recall_notes'] },
      { scope: ['test-app'], key: 'tools.disabled', value: ['save_profile'] },
    ])
    expect(cfg.tools.enabled).toEqual(['create_fiche'])
    expect(cfg.tools.disabled.sort()).toEqual(['recall_notes', 'save_profile'])
  })

  it('refuse une clé non autorisée à chaud', () => {
    expect(isSettableKey('slug')).toBe(false)
    expect(isSettableKey('pricing.groq')).toBe(false)
    expect(isSettableKey('agent.maxSteps')).toBe(true)
    const cfg = resolveConfig(baseApp, [{ scope: 'all', key: 'slug', value: 'pirate' }])
    expect(cfg.slug).toBe('test-app')
  })

  it('lève si la configuration résolue est invalide', () => {
    expect(() => resolveConfig(baseApp, [{ scope: 'all', key: 'agent.maxSteps', value: 999 }])).toThrow()
  })
})
