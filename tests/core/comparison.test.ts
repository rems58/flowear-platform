import { describe, expect, it } from 'vitest'
import { amorceApp } from '@/apps/amorce/manifest'
import { remyApp } from '@/apps/remy/manifest'
import { buildComparison } from '@/core/billing/comparison'
import { SUPPORTED_LOCALES } from '@/core/i18n/locale'

describe('tableau gratuit contre abonné, déduit du manifeste', () => {
  it('Amorce : messages, recherche web, rappels et reprise du questionnaire bridés ; tâches, minuteur, premier questionnaire ouverts', () => {
    const rows = buildComparison(amorceApp, [], 'fr')
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(byKey.messages).toMatchObject({ free: '5 par jour', paid: '150 par jour', locked: true })
    // Même modèle des deux côtés : la ligne existe, sans cadenas.
    expect(byKey.model).toMatchObject({ locked: false })
    expect(byKey.web).toMatchObject({ free: 'non', paid: 'oui', locked: true })
    expect(byKey.reminders).toMatchObject({ free: '1 actif', paid: '6 actifs', locked: true })
    expect(byKey.retake).toMatchObject({ free: 'une fois seulement', paid: 'oui', locked: true })
    expect(byKey.open.label).toBe('Mémoire et profil, tâches, minuteur, premier questionnaire, dictée')
    expect(byKey.open.locked).toBe(false)
  })

  it('Rémy : fiches et recherche web en plus, sans tâches ; et cinq langues', () => {
    const rows = buildComparison(remyApp, [], 'en')
    const keys = rows.map((r) => r.key)
    expect(keys).toEqual(['messages', 'model', 'artifacts', 'web', 'open'])
    expect(rows.find((r) => r.key === 'open')?.label).toBe('Memory and profile, dictation')
    for (const locale of SUPPORTED_LOCALES) expect(buildComparison(remyApp, [], locale).length).toBe(5)
  })

  it('suit un réglage à chaud : 10 messages gratuits par jour, le tableau le dit', () => {
    const rows = buildComparison(amorceApp, [{ scope: 'all', key: 'plans.free.messagesPerDay', value: 10 }], 'fr')
    expect(rows.find((r) => r.key === 'messages')?.free).toBe('10 par jour')
  })
})
