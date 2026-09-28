import { describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { DraftError, STUDIO_TERMS_VERSION, emptyManifest, isSlugAvailable, saveCreatorDraft, submitCreatorApp, type ScenarioRunner } from '@/core/studio/draft'
import { runManifestChecks } from '@/core/studio/checks'

const L = (fr: string, en = fr) => ({ en, fr, es: en, de: en, it: en })
const good = {
  slug: 'sommeil',
  name: 'Sommeil',
  tagline: L('Un coach sommeil pour jeunes parents.'),
  persona: { system: 'Tu es Sommeil, un coach pour jeunes parents fatigués. Tu poses une seule question à la fois, tu proposes un geste concret pour la nuit qui vient, et tu ne donnes jamais de conseil médical : si la question relève d’un médecin, tu le dis en une phrase et tu renvoies vers lui.' },
  onboarding: { questions: [{ type: 'text', key: 'babyAge', label: L('Âge du bébé ?') }] },
  suggestions: [{ label: L('Ce soir'), prompt: L('Aide-moi pour ce soir.') }],
  tools: { enabled: ['save_profile'] },
  pwa: { shortName: 'Sommeil', themeColor: '#5E5CE6', backgroundColor: '#ffffff' },
}
const passing: ScenarioRunner = async () => [{ check: 'scenario', ok: true, detail: null }, { check: 'cost_probe', ok: true, detail: null }]
const failingScenario: ScenarioRunner = async () => [{ check: 'scenario', ok: false, detail: 'distress : pas de carte' }, { check: 'cost_probe', ok: true, detail: null }]

describe('brouillon et soumission d’une IA créateur', () => {
  it('le brouillon vide passe le schéma une fois nom, accroche et persona remplis', () => {
    const m = emptyManifest('sommeil')
    expect(runManifestChecks({ manifest: m, knowledge: [] }).find((c) => c.check === 'schema')?.ok).toBe(false)
    const filled = { ...m, name: 'Sommeil', tagline: L('Un coach.'), persona: { system: good.persona.system } }
    expect(runManifestChecks({ manifest: filled, knowledge: [] }).find((c) => c.check === 'schema')?.ok).toBe(true)
  })

  it('crée le brouillon, refuse un slug réservé ou pris, et une deuxième IA', async () => {
    const { repo } = createMemoryRepo()
    await expect(saveCreatorDraft(repo, 'c1', { slug: 'amorce', manifest: good, knowledge: [] })).rejects.toMatchObject({ code: 'slug_reserved' })
    const app = await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: good, knowledge: [] })
    expect(app.status).toBe('draft')
    expect(app.ownerId).toBe('c1')
    await expect(saveCreatorDraft(repo, 'c2', { slug: 'sommeil', manifest: good, knowledge: [] })).rejects.toMatchObject({ code: 'slug_taken' })
    await expect(saveCreatorDraft(repo, 'c1', { slug: 'autre', manifest: good, knowledge: [] })).rejects.toMatchObject({ code: 'one_app' })
    expect(await isSlugAvailable(repo, 'sommeil', 'c1')).toBe('available')
    expect(await isSlugAvailable(repo, 'sommeil', 'c2')).toBe('taken')
    expect(await isSlugAvailable(repo, 'studio', 'c2')).toBe('reserved')
    expect(await isSlugAvailable(repo, 'X', 'c2')).toBe('invalid')
  })

  it('la soumission exige les CGU courantes, bloque sur une règle en échec, puis fige le brouillon', async () => {
    const { repo, state } = createMemoryRepo()
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: good, knowledge: [] })
    await expect(submitCreatorApp(repo, 'c1', { termsVersion: null }, passing)).rejects.toMatchObject({ code: 'terms_required' })
    await expect(submitCreatorApp(repo, 'c1', { termsVersion: '2020-01-01' }, passing)).rejects.toMatchObject({ code: 'terms_required' })

    const err = await submitCreatorApp(repo, 'c1', { termsVersion: STUDIO_TERMS_VERSION }, failingScenario).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DraftError)
    expect((err as DraftError).code).toBe('checks_failed')
    expect((err as DraftError).results?.filter((r) => !r.ok).map((r) => r.check)).toEqual(['scenario'])
    expect((await repo.creatorApps.listChecks('sommeil', 1)).some((c) => c.check === 'scenario' && !c.ok)).toBe(true)
    expect((await repo.creatorApps.get('sommeil'))?.status).toBe('draft')

    const { app, results } = await submitCreatorApp(repo, 'c1', { termsVersion: STUDIO_TERMS_VERSION }, passing)
    expect(app.status).toBe('submitted')
    expect(app.version).toBe(1)
    expect(app.termsAcceptedAt).not.toBeNull()
    expect(results.every((r) => r.ok)).toBe(true)
    expect(state.creatorEvents.map((e) => e.action)).toEqual(['submit_rejected', 'submit'])
    // Soumis : le brouillon est figé jusqu'au verdict.
    await expect(saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: good, knowledge: [] })).rejects.toMatchObject({ code: 'locked' })
    await expect(submitCreatorApp(repo, 'c1', { termsVersion: STUDIO_TERMS_VERSION }, passing)).rejects.toMatchObject({ code: 'locked' })
  })

  it('le scénario ne tourne pas si une règle sans réseau échoue déjà', async () => {
    const { repo } = createMemoryRepo()
    let called = false
    const spy: ScenarioRunner = async () => {
      called = true
      return []
    }
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: { ...good, persona: { system: 'court' } }, knowledge: [] })
    await submitCreatorApp(repo, 'c1', { termsVersion: STUDIO_TERMS_VERSION }, spy).catch(() => undefined)
    expect(called).toBe(false)
  })

  it('un brouillon est nettoyé dès la sauvegarde : ni logo SVG, ni accès privé, ni outil hors catalogue', async () => {
    const { repo } = createMemoryRepo()
    const app = await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: { ...good, access: 'private', brand: { from: '#000000', to: '#ffffff', glyph: 'S', mark: '<image href="x" onerror="alert(1)"/>' }, tools: { enabled: ['save_profile', 'search_web'] }, config: { models: {} } }, knowledge: [] })
    expect(app.manifest.brand?.mark).toBeUndefined()
    expect(app.manifest.access).toBe('public')
    expect(app.manifest.tools.enabled).toEqual(['save_profile'])
    expect(app.manifest.config).toBeUndefined()
  })

  it('le questionnaire décrit en mots est gardé à part, et Flowear peut le poser dans le brouillon', async () => {
    const { repo } = createMemoryRepo()
    const app = await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: good, knowledge: [], requests: { assessment: 'Six questions sur le sommeil, source : échelle maison.' } })
    expect(app.requests.assessment).toContain('Six questions')
    expect(app.manifest.assessments).toBeUndefined()
    await repo.creatorApps.setAssessments('sommeil', [{ id: 'nuit' }])
    expect((await repo.creatorApps.get('sommeil'))?.manifest.assessments).toEqual([{ id: 'nuit' }])
  })

  it('un questionnaire posé par Flowear active l’outil, et la sauvegarde de l’éditeur ne peut pas l’effacer', async () => {
    const { repo } = createMemoryRepo()
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: good, knowledge: [], requests: { assessment: 'Six questions sur le sommeil.' } })
    await repo.creatorApps.setAssessments('sommeil', [{ id: 'nuit' }])
    let app = (await repo.creatorApps.get('sommeil'))!
    expect(app.manifest.tools.enabled).toContain('assessment')
    // L'éditeur, ouvert avant, renvoie son manifeste local sans questionnaire : Flowear garde la main.
    app = await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: { ...good, tagline: L('Nouvelle accroche.') }, knowledge: [], requests: { assessment: 'Six questions sur le sommeil.' } })
    expect(app.manifest.assessments).toEqual([{ id: 'nuit' }])
    expect(JSON.stringify(app.manifest.tagline)).toContain('Nouvelle accroche')
    // En mode avancé (plus de description), c'est le créateur qui tient le questionnaire.
    app = await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: good, knowledge: [], requests: {} })
    expect(app.manifest.assessments).toBeUndefined()
  })
})
