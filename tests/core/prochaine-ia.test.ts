import { beforeEach, describe, expect, it } from 'vitest'
import { defineApp } from '@/apps/types'
import { directToolInput, forcedToolFor, restartAssessmentFor } from '@/core/agent/forced-tool'
import { createBareToolNameGuard, createToolJsonGuard } from '@/core/agent/json-guard'
import { resolveConfig } from '@/core/config/resolve'
import { profileRows } from '@/core/memory/profile-view'
import { isGroundedIn } from '@/core/tools/grounded'
import { isTextOnlyMessage } from '@/core/agent/forced-tool'
import { buildSystemPrompt } from '@/core/memory/system-prompt'
import { ensureToolsRegistered, resetTools, resolveTools } from '@/core/tools'
import { getMessages } from '@/lib/i18n/messages'
import { toPublicApp } from '@/lib/public-app'
import { sanitizeCreatorManifest } from '@/core/studio/manifest'

/**
 * Preuve : une IA fictive, jamais enregistrée nulle part, définie par son seul manifeste.
 * Tout ce qui a été corrigé sur Amorce doit valoir pour elle sans une ligne de plus.
 * Si un mécanisme de base régresse, ou si quelqu'un le remet dans une IA au lieu de la base,
 * ce test le dit.
 */
const L = (fr: string, en = fr) => ({ en, fr, es: en, de: en, it: en })

const preuveApp = defineApp({
  slug: 'preuve',
  name: 'Preuve',
  tagline: L('Une IA de test.'),
  access: 'private',
  category: 'assistant',
  brand: { from: '#0EA5E9', to: '#6366F1', glyph: 'P' },
  persona: { system: 'Tu es Preuve, une IA de test qui répond court et concret.', boundaries: [] },
  onboarding: {
    questions: [
      { type: 'text', key: 'firstName', label: L('Comment je t’appelle ?', 'What should I call you?'), maxLength: 40 },
      { type: 'choice', key: 'rythme', label: L('Ton rythme ?', 'Your pace?'), options: [{ value: 'lent', label: L('Lent', 'Slow') }, { value: 'vif', label: L('Vif', 'Fast') }] },
    ],
  },
  tools: { enabled: ['ask_choice', 'focus_timer', 'update_task', 'assessment', 'schedule_checkin', 'cancel_checkin', 'save_profile', 'save_note', 'recall_notes', 'create_fiche', 'search_knowledge'] },
  tasks: { enabled: true, maxInPrompt: 10 },
  assessments: [
    {
      id: 'sommeil',
      name: L('Bilan sommeil', 'Sleep check'),
      intro: L('Deux questions.', 'Two questions.'),
      questions: [
        { key: 'q1', label: L('Tu dors bien ?', 'Do you sleep well?'), options: [{ value: 'oui', label: L('Oui', 'Yes'), score: 0 }, { value: 'non', label: L('Non', 'No'), score: 1, zone: true }] },
        { key: 'q2', label: L('Tu te réveilles la nuit ?', 'Do you wake up at night?'), options: [{ value: 'oui', label: L('Oui', 'Yes'), score: 1, zone: true }, { value: 'non', label: L('Non', 'No'), score: 0 }] },
      ],
      levels: [{ min: 0, id: 'low', label: L('faible', 'low') }, { min: 2, id: 'high', label: L('élevé', 'high') }],
      result: L('{percent} %, niveau {level}.', '{percent}%, level {level}.'),
      disclaimer: L('Un repère, pas un diagnostic.', 'A hint, not a diagnosis.'),
      profileKey: 'sommeil',
    },
  ],
  suggestions: [{ label: L('Où j’en suis ?', 'Where am I?'), prompt: L('Où j’en suis ?', 'Where am I?') }],
  profileLabels: { chrono: L('Chronotype', 'Chronotype') },
  pwa: { shortName: 'Preuve', themeColor: '#111111', backgroundColor: '#ffffff' },
  kill: { d7RetentionMin: 0.2, signupsPer10CarouselsMin: 50, reviewAfterWeeks: 4 },
  statuses: [{ id: 'profil_complet', label: L('Profil complet', 'Profile complete'), rule: { type: 'onboarding_done' } }],
})

const NOW = new Date('2026-09-18T10:00:00Z')

describe('une IA nouvelle hérite de tout ce qui a été corrigé sur Amorce', () => {
  beforeEach(() => {
    resetTools()
    ensureToolsRegistered()
  })

  it('a les panneaux Tâches, Rappels et Fiches dans ses outils, et ses suggestions, sans rien déclarer', () => {
    const pub = toPublicApp(preuveApp, 'fr')
    expect(pub.panels.map((p) => `${p.type}:${p.label}`).sort()).toEqual(['checkin:Rappels', 'fiche:Fiches', 'help:Guide', 'tasks:Tâches'])
    expect(pub.suggestions).toEqual([{ label: 'Où j’en suis ?', prompt: 'Où j’en suis ?' }])
  })

  it('ses cartes qui attendent un geste clôturent le tour d office', () => {
    const defs = resolveTools(resolveConfig(preuveApp, []), 'free')
    const ending = defs.filter((t) => t.endsTurn).map((t) => t.name).sort()
    expect(ending).toEqual(['ask_choice', 'assessment', 'focus_timer'])
    expect(defs.find((t) => t.name === 'save_note')?.endsTurn).toBe(false)
  })

  it('dispose du filtre d ancrage pour ses propres outils d extraction', () => {
    expect(isGroundedIn('Lister les tâches en suspens', 'désolé j’ai tout lâché')).toBe(false)
    expect(isGroundedIn('Appeler le dentiste', 'faut que je rappelle le dentiste')).toBe(true)
  })

  it('répond en mots à une excuse, sans outil, quelle que soit l IA', () => {
    expect(isTextOnlyMessage('pardon, j’ai tout abandonné')).toBe(true)
  })

  it('a l outil helpline sans le déclarer, et son prompt interdit d écrire un numéro', () => {
    const defs = resolveTools(resolveConfig(preuveApp, []), 'free')
    expect(defs.map((t) => t.name)).toContain('helpline')
    const prompt = buildSystemPrompt({ app: preuveApp, locale: 'fr', profile: {}, notes: [], toolNames: defs.map((t) => t.name), plan: 'free' } as Parameters<typeof buildSystemPrompt>[0])
    expect(prompt).toContain('tu appelles helpline')
    expect(prompt).toContain("INTERDIT d'écrire un numéro de téléphone")
  })

  it('les suites connues s exécutent sans le modèle : énergie, carte de tâche, questionnaire, relance', () => {
    const base = { app: preuveApp, toolNames: ['ask_choice', 'assessment', 'update_task'], messages: getMessages, now: NOW, openTasks: 2, locale: 'fr' as const }
    // Réponse d'énergie sans outil next_action (propre à Amorce) : rien n'est imposé, pas d'erreur.
    expect(forcedToolFor({ ...base, profile: {}, userText: 'En forme' })).toBeNull()
    // Carte de tâche : l'énergie est redemandée par le code, question et options dans la langue.
    expect(forcedToolFor({ ...base, profile: {}, userText: 'Fait : Le mail' })).toBe('ask_choice')
    expect(directToolInput('ask_choice', { ...base, profile: {}, userText: 'Fait : Le mail' })).toEqual({ question: 'Ton énergie, là, maintenant ?', options: ['À plat', 'Moyen', 'En forme'] })
    // Questionnaire en cours : une réponse impose l'outil avec le bon identifiant.
    const during = { ...base, profile: { _assess_sommeil: { answers: {}, startedAt: NOW.toISOString() } }, userText: 'Non' }
    expect(forcedToolFor(during)).toBe('assessment')
    expect(directToolInput('assessment', during)).toEqual({ assessmentId: 'sommeil' })
    // Relance depuis la carte de résultat, dans n'importe quelle langue.
    expect(restartAssessmentFor(preuveApp, 'Refaire le questionnaire : Bilan sommeil', getMessages)).toBe('sommeil')
    expect(restartAssessmentFor(preuveApp, 'Retake the questionnaire: Sleep check', getMessages)).toBe('sommeil')
  })

  it('ses gardes de flux filtrent JSON en texte, note pour soi et nom d outil en titre', () => {
    const defs = resolveTools(resolveConfig(preuveApp, []), 'free')
    const json = createToolJsonGuard(defs)
    const text = json.push('Bien. {"question":"Ton énergie ?","options":["À plat","Moyen"]} (Note: wait for answer) Ok.').join('') + json.flush()
    expect(text).toBe('Bien.   Ok.')
    const names = createBareToolNameGuard(defs.map((t) => t.name))
    expect(names.push('--- schedule_checkin ---').join('') + names.flush()).toBe('')
  })

  it('sa page mémoire est lisible et son prompt montre clés et valeurs admises', () => {
    const profile = { firstName: 'Léa', rythme: 'vif', sommeil_percent: 50, sommeil_level: 'low', sommeil_zone: '1/2', sommeil_date: '2026-09-18', chrono: 'du soir', energy_now: 'Moyen', _energy_now_at: NOW.toISOString(), _assess_sommeil_done: { answers: {} } }
    const rows = profileRows(preuveApp, profile, 'fr')
    expect(rows.onboarding.map((r) => `${r.label} = ${r.value}`)).toEqual(['Comment je t’appelle ? = Léa', 'Ton rythme ? = Vif'])
    expect(rows.learned.map((r) => `${r.label} = ${r.value}`)).toEqual(['Bilan sommeil = 50 % · faible · 1/2 · 18/09/2026', 'Chronotype = du soir', 'Énergie du moment = Moyen'])
    const prompt = buildSystemPrompt({ app: preuveApp, locale: 'fr', profile, notes: [], toolNames: ['save_profile'], plan: 'free' } as Parameters<typeof buildSystemPrompt>[0])
    expect(prompt).toContain('[firstName] : Léa')
    expect(prompt).toContain('[rythme] : vif (valeurs possibles : lent, vif)')
    expect(prompt).not.toContain('_energy_now_at')
    expect(prompt).toContain('jamais de note pour toi-même')
  })
  it('passerait telle quelle par le Studio : le nettoyage créateur ne lui retire que ce que le serveur impose', () => {
    const clean = defineApp(sanitizeCreatorManifest({ ...preuveApp, statuses: [] } as never))
    expect(clean.access).toBe('public')
    expect(clean.tools.enabled).toEqual(preuveApp.tools.enabled)
    expect(clean.plans?.free?.messagesPerDay).toBe(3)
  })

})
