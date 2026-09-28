import { describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { loadCreatorAppsInto } from '@/core/apps/load'
import { clearStoredApps } from '@/core/apps/store'
import { getApp } from '@/apps/registry'
import { STUDIO_TERMS_VERSION, latestChecks, saveCreatorDraft, submitCreatorApp } from '@/core/studio/draft'
import { REVIEW_CHECKLIST, ReviewError, applyReviewDecision, reviewDecisionSchema } from '@/core/studio/review'

const L = (fr: string, en = fr) => ({ en, fr, es: en, de: en, it: en })
const manifest = {
  slug: 'sommeil',
  name: 'Sommeil',
  tagline: L('Un coach sommeil pour jeunes parents.'),
  persona: { system: 'Tu es Sommeil, un coach pour jeunes parents fatigués. Tu poses une seule question à la fois, tu proposes un geste concret pour la nuit qui vient, et tu ne donnes jamais de conseil médical : si la question relève d’un médecin, tu le dis en une phrase et tu renvoies vers lui.' },
  onboarding: { questions: [{ type: 'text', key: 'babyAge', label: L('Âge du bébé ?') }] },
  tools: { enabled: ['save_profile'] },
  pwa: { shortName: 'Sommeil', themeColor: '#5E5CE6', backgroundColor: '#ffffff' },
}
const allChecked = REVIEW_CHECKLIST.map(() => true as const)
const passing = async () => [{ check: 'scenario' as const, ok: true, detail: null }, { check: 'cost_probe' as const, ok: true, detail: null }]

async function submitted() {
  const { repo, state } = createMemoryRepo()
  await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest, knowledge: [] })
  await submitCreatorApp(repo, 'c1', { termsVersion: STUDIO_TERMS_VERSION }, passing)
  return { repo, state }
}

describe('revue admin d’une IA créateur', () => {
  it('la décision d’approbation exige toute la liste cochée et un partage connu', () => {
    expect(reviewDecisionSchema.safeParse({ action: 'approve', checklist: allChecked, sharePercent: 50 }).success).toBe(true)
    expect(reviewDecisionSchema.safeParse({ action: 'approve', checklist: allChecked.slice(1), sharePercent: 50 }).success).toBe(false)
    expect(reviewDecisionSchema.safeParse({ action: 'approve', checklist: [...allChecked.slice(1), false], sharePercent: 50 }).success).toBe(false)
    // Un seul partage, 50 %, quel que soit qui construit : 30 ou 70 sont refusés, l'absence vaut 50.
    expect(reviewDecisionSchema.safeParse({ action: 'approve', checklist: allChecked, sharePercent: 70 }).success).toBe(false)
    expect(reviewDecisionSchema.safeParse({ action: 'approve', checklist: allChecked, sharePercent: 30 }).success).toBe(false)
    expect(reviewDecisionSchema.parse({ action: 'approve', checklist: allChecked })).toMatchObject({ sharePercent: 50 })
  })

  it('approuver publie, fixe le partage, journalise, et l’IA entre dans le registre', async () => {
    const { repo, state } = await submitted()
    const out = await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'approve', checklist: allChecked, sharePercent: 50 }, termsVersion: STUDIO_TERMS_VERSION })
    expect(out.app.status).toBe('published')
    expect(out.app.sharePercent).toBe(50)
    expect(out.app.publishedManifest).not.toBeNull()
    expect(out.mail).toBe('approved')
    expect(out.invalidate).toBe(true)
    expect(state.creatorEvents.map((e) => e.action)).toContain('publish')
    await loadCreatorAppsInto(repo)
    expect(getApp('sommeil')?.slug).toBe('sommeil')
    clearStoredApps()
  })

  it('demander des changements rend le brouillon au créateur avec le motif ; en ligne, l’IA le reste', async () => {
    const { repo } = await submitted()
    const out = await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'request_changes', notes: 'Persona trop vague.' }, termsVersion: STUDIO_TERMS_VERSION })
    expect(out.app.status).toBe('changes_requested')
    expect(out.app.reviewNotes).toBe('Persona trop vague.')
    expect(out.invalidate).toBe(false)
    // Le créateur peut à nouveau modifier et resoumettre, la version monte.
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest, knowledge: [] })
    const { app } = await submitCreatorApp(repo, 'c1', { termsVersion: STUDIO_TERMS_VERSION }, passing)
    expect(app.version).toBe(2)

    await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'approve', checklist: allChecked, sharePercent: 50 }, termsVersion: STUDIO_TERMS_VERSION })
    const live = await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'request_changes', notes: 'Accroche à revoir.' }, termsVersion: STUDIO_TERMS_VERSION })
    expect(live.app.status).toBe('published')
    expect(live.app.reviewNotes).toBe('Accroche à revoir.')
  })

  it('suspendre ne vaut que pour une IA en ligne, et la retire du registre', async () => {
    const { repo } = await submitted()
    await expect(applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'suspend', reason: 'plainte' }, termsVersion: STUDIO_TERMS_VERSION })).rejects.toMatchObject({ code: 'wrong_status' })
    await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'approve', checklist: allChecked, sharePercent: 50 }, termsVersion: STUDIO_TERMS_VERSION })
    await loadCreatorAppsInto(repo)
    expect(getApp('sommeil')).toBeDefined()
    const out = await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'suspend', reason: 'plainte' }, termsVersion: STUDIO_TERMS_VERSION })
    expect(out.app.status).toBe('suspended')
    expect(out.mail).toBe('suspended')
    await loadCreatorAppsInto(repo)
    expect(getApp('sommeil')).toBeUndefined()
    clearStoredApps()
    await expect(applyReviewDecision(repo, { slug: 'x', adminId: 'admin', decision: { action: 'suspend', reason: 'plainte' }, termsVersion: STUDIO_TERMS_VERSION })).rejects.toBeInstanceOf(ReviewError)
  })

  it('un brouillon jamais soumis ne peut pas être approuvé', async () => {
    const { repo } = createMemoryRepo()
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest, knowledge: [] })
    await expect(applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'approve', checklist: allChecked, sharePercent: 50 }, termsVersion: STUDIO_TERMS_VERSION })).rejects.toMatchObject({ code: 'wrong_status' })
  })

  it('une IA en ligne qui resoumet reste en ligne pendant la revue, avec son ancienne version', async () => {
    const { repo } = await submitted()
    await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'approve', checklist: allChecked, sharePercent: 50 }, termsVersion: STUDIO_TERMS_VERSION })
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: { ...manifest, tagline: L('Nouvelle accroche.') }, knowledge: [] })
    await submitCreatorApp(repo, 'c1', { termsVersion: STUDIO_TERMS_VERSION }, passing)
    expect((await repo.creatorApps.get('sommeil'))?.status).toBe('submitted')
    await loadCreatorAppsInto(repo)
    const live = getApp('sommeil')
    expect(live).toBeDefined()
    expect(JSON.stringify(live?.tagline)).toContain('Un coach sommeil')
    clearStoredApps()
  })

  it('approuver refuse un brouillon qui ne passe plus le schéma', async () => {
    const { repo } = await submitted()
    await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'request_changes', notes: 'x' }, termsVersion: STUDIO_TERMS_VERSION })
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest: { ...manifest, persona: { system: 'court' } }, knowledge: [] })
    await expect(applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'approve', checklist: allChecked, sharePercent: 50 }, termsVersion: STUDIO_TERMS_VERSION })).rejects.toMatchObject({ code: 'invalid_manifest' })
  })

  it('après une resoumission refusée, les vérifications montrées sont celles de la tentative', async () => {
    const { repo } = await submitted()
    await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'request_changes', notes: 'x' }, termsVersion: STUDIO_TERMS_VERSION })
    const failing = async () => [{ check: 'scenario' as const, ok: false, detail: 'distress' }, { check: 'cost_probe' as const, ok: true, detail: null }]
    await submitCreatorApp(repo, 'c1', { termsVersion: STUDIO_TERMS_VERSION }, failing).catch(() => undefined)
    const app = (await repo.creatorApps.get('sommeil'))!
    expect(app.version).toBe(1)
    const shown = await latestChecks(repo, app)
    expect(shown.find((c) => c.check === 'scenario')?.ok).toBe(false)
  })

  it('une IA suspendue ne revient pas en ligne si le créateur resoumet, et la note de suspension s’efface', async () => {
    const { repo } = await submitted()
    await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'approve', checklist: allChecked, sharePercent: 50 }, termsVersion: STUDIO_TERMS_VERSION })
    await applyReviewDecision(repo, { slug: 'sommeil', adminId: 'admin', decision: { action: 'suspend', reason: 'plainte' }, termsVersion: STUDIO_TERMS_VERSION })
    await saveCreatorDraft(repo, 'c1', { slug: 'sommeil', manifest, knowledge: [] })
    await submitCreatorApp(repo, 'c1', { termsVersion: STUDIO_TERMS_VERSION }, passing)
    const app = (await repo.creatorApps.get('sommeil'))!
    expect(app.status).toBe('submitted')
    expect(app.reviewNotes).toBeNull()
    await loadCreatorAppsInto(repo)
    expect(getApp('sommeil')).toBeUndefined()
    clearStoredApps()
  })
})
