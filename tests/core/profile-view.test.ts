import { describe, expect, it } from 'vitest'
import { amorceApp } from '@/apps/amorce/manifest'
import { profileRows } from '@/core/memory/profile-view'
import { buildSystemPrompt } from '@/core/memory/system-prompt'

const profile = {
  firstName: 'Rémy',
  style: 'direct',
  asrs_percent: 67,
  asrs_level: 'high',
  asrs_zone: '5/6',
  asrs_date: '2026-09-17',
  energy_now: 'Moyen',
  _energy_now_at: '2026-09-17T14:32:21.218Z',
  _assess_asrs_done: { answers: {} },
  current_energy: 'Moyen',
}

describe('profil lisible (page mémoire)', () => {
  it('libellés lisibles, questionnaire sur une ligne, mécanique cachée, clé inconnue humanisée', () => {
    const { onboarding, learned } = profileRows(amorceApp, profile, 'fr')
    expect(onboarding.map((r) => r.label)).toEqual(['Comment je t’appelle ?', 'Tu préfères que je te parle comment ?'])
    expect(onboarding[1].value).toBe('Direct')
    const labels = learned.map((r) => r.label)
    expect(labels).toEqual(['Dépistage TDAH (ASRS, OMS)', 'Énergie du moment', 'Current energy'])
    const asrs = learned[0]
    expect(asrs.value).toBe('67 % · élevé · 5/6 · 17/09/2026')
    expect(asrs.keys).toEqual(['asrs_percent', 'asrs_level', 'asrs_zone', 'asrs_date'])
    expect(JSON.stringify(learned)).not.toContain('_energy_now_at')
    expect(JSON.stringify(learned)).not.toContain('[object Object]')
  })

  it('le prompt montre la clé de chaque champ, pour que le modèle corrige sans en créer un autre', () => {
    const prompt = buildSystemPrompt({ app: amorceApp, locale: 'fr', profile, notes: [], toolNames: ['save_profile'], plan: 'free' } as Parameters<typeof buildSystemPrompt>[0])
    expect(prompt).toContain('[firstName] : Rémy')
    expect(prompt).toContain('[style] : direct (valeurs possibles : doux, direct, coach)')
    expect(prompt).not.toContain('_energy_now_at')
  })
})
