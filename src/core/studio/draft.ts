import { z } from 'zod'
import type { AppManifestInput } from '@/apps/types'
import type { Repo } from '@/core/data/repo'
import type { CreatorApp, CreatorKnowledgeFile } from '@/core/data/types'
import { assertSlugAvailable } from '@/core/apps/reserved'
import { checksPass, runManifestChecks, KNOWLEDGE_MAX_BYTES, KNOWLEDGE_MAX_FILES, type CheckResult } from './checks'
import { sanitizeCreatorManifest, withAssessments } from './manifest'

/** Version datée des CGU Studio : une nouvelle version redemande l'acceptation à la soumission. */
export const STUDIO_TERMS_VERSION = '2026-09-24'
/** Questionnaire décrit en mots : assez pour les questions, les réponses et la source. */
export const ASSESSMENT_BRIEF_MAX = 6000
/** Assez pour un logo en image (200 Ko au plus) et le reste du manifeste. */
export const MANIFEST_MAX_BYTES = 300_000

export const knowledgeFileSchema = z.object({ name: z.string().regex(/^[a-z0-9-]{1,40}$/), markdown: z.string().max(KNOWLEDGE_MAX_BYTES) })

/** Corps de sauvegarde d'un brouillon : le manifeste reste un objet libre, les règles disent le reste. */
export const creatorDraftSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,32}$/),
  manifest: z.record(z.string(), z.unknown()).refine((m) => JSON.stringify(m).length <= MANIFEST_MAX_BYTES, 'manifest_too_large'),
  knowledge: z.array(knowledgeFileSchema).max(KNOWLEDGE_MAX_FILES).default([]),
  /** Ce que Flowear construit pour le créateur, décrit en mots. */
  requests: z.object({ assessment: z.string().max(ASSESSMENT_BRIEF_MAX).optional() }).optional(),
})
export type CreatorDraftInput = z.infer<typeof creatorDraftSchema>

/** Statuts pendant lesquels le brouillon est figé : Rémy relit exactement ce qui a été soumis. */
export const LOCKED_STATUSES: readonly CreatorApp['status'][] = ['submitted', 'in_review']

export class DraftError extends Error {
  constructor(public readonly code: 'slug_invalid' | 'slug_reserved' | 'slug_taken' | 'one_app' | 'locked' | 'not_found' | 'terms_required' | 'checks_failed', public readonly results?: CheckResult[]) {
    super(code)
  }
}

/** Le brouillon de départ : ce que voit un créateur qui arrive, à remplir. */
export function emptyManifest(slug: string): AppManifestInput {
  return {
    slug,
    name: '',
    tagline: { en: '', fr: '', es: '', de: '', it: '' },
    brand: { from: '#5E5CE6', to: '#3F3DB8', glyph: slug.slice(0, 1).toUpperCase() || 'A' },
    persona: { system: '' },
    onboarding: { questions: [{ type: 'text', key: 'firstName', label: { en: 'What should I call you?', fr: 'Comment je t’appelle ?', es: '¿Cómo te llamo?', de: 'Wie soll ich dich nennen?', it: 'Come ti chiamo?' } }] },
    suggestions: [],
    tools: { enabled: ['save_profile', 'save_note', 'recall_notes'] },
    pwa: { shortName: slug.slice(0, 12), themeColor: '#5E5CE6', backgroundColor: '#ffffff' },
  }
}

/** Un créateur = une IA. La sienne, ou rien. */
export async function getCreatorApp(repo: Repo, ownerId: string): Promise<CreatorApp | null> {
  const mine = await repo.creatorApps.listByOwner(ownerId)
  return mine[0] ?? null
}

/**
 * Sauvegarde du brouillon. Le slug est fixé à la création (il devient l'adresse de l'IA) ;
 * une deuxième IA se demande à Rémy ; un brouillon soumis attend le verdict.
 */
export async function saveCreatorDraft(repo: Repo, ownerId: string, input: CreatorDraftInput): Promise<CreatorApp> {
  const existing = await getCreatorApp(repo, ownerId)
  if (existing) {
    if (existing.slug !== input.slug) throw new DraftError('one_app')
    if (LOCKED_STATUSES.includes(existing.status)) throw new DraftError('locked')
  } else {
    try {
      assertSlugAvailable(input.slug)
    } catch (error) {
      throw new DraftError(error instanceof Error && error.message === 'slug_reserved' ? 'slug_reserved' : 'slug_invalid')
    }
    if (await repo.creatorApps.get(input.slug)) throw new DraftError('slug_taken')
  }
  // Nettoyé dès l'écriture : ce qu'un créateur ne peut pas porter (`brand.mark` = SVG injecté tel
  // quel dans les pages, accès, config, plans) n'entre jamais en base, même par la route brute.
  let manifest = sanitizeCreatorManifest({ ...(input.manifest as AppManifestInput), slug: input.slug })
  // Questionnaire décrit en mots : c'est Flowear qui le construit et le pose. Le brouillon envoyé
  // par l'éditeur (état local, peut-être ouvert depuis avant) ne peut ni l'écraser ni l'effacer.
  if (input.requests?.assessment?.trim()) manifest = withAssessments(manifest, existing?.manifest.assessments as unknown[] | undefined)
  try {
    return await repo.creatorApps.saveDraft({ slug: input.slug, ownerId, manifest, knowledge: input.knowledge, requests: input.requests })
  } catch (error) {
    if (error instanceof Error && error.message === 'slug_taken') throw new DraftError('slug_taken')
    throw error
  }
}

export async function isSlugAvailable(repo: Repo, slug: string, ownerId: string): Promise<'available' | 'invalid' | 'reserved' | 'taken'> {
  try {
    assertSlugAvailable(slug)
  } catch (error) {
    return error instanceof Error && error.message === 'slug_reserved' ? 'reserved' : 'invalid'
  }
  const row = await repo.creatorApps.get(slug)
  return row && row.ownerId !== ownerId ? 'taken' : 'available'
}

/** La version que la prochaine soumission portera : les vérifications s'enregistrent sous elle. */
export function nextVersion(app: CreatorApp): number {
  return app.version + (app.submittedAt ? 1 : 0)
}

/** Les vérifications à montrer : celles de la dernière tentative, réussie ou non. */
export async function latestChecks(repo: Repo, app: CreatorApp): Promise<CheckResult[]> {
  const tried = await repo.creatorApps.listChecks(app.slug, nextVersion(app))
  if (tried.length) return tried as CheckResult[]
  return (await repo.creatorApps.listChecks(app.slug, app.version)) as CheckResult[]
}

export type ScenarioRunner = (input: { manifest: AppManifestInput; knowledge: CreatorKnowledgeFile[]; ownerId: string }) => Promise<CheckResult[]>

/**
 * Soumission : CGU acceptées (version courante), douze règles puis scénario, tout enregistré ;
 * une seule règle en échec bloque et renvoie la liste complète. Sinon la version monte et
 * l'IA entre dans la file de revue.
 */
export async function submitCreatorApp(repo: Repo, ownerId: string, input: { termsVersion: string | null; allowedHosts?: string[] }, runScenario: ScenarioRunner): Promise<{ app: CreatorApp; results: CheckResult[] }> {
  const app = await getCreatorApp(repo, ownerId)
  if (!app) throw new DraftError('not_found')
  if (LOCKED_STATUSES.includes(app.status)) throw new DraftError('locked')
  if (input.termsVersion !== STUDIO_TERMS_VERSION) throw new DraftError('terms_required')

  const version = nextVersion(app)
  const results = runManifestChecks({ manifest: app.manifest, knowledge: app.knowledge, allowedHosts: input.allowedHosts })
  // Le scénario coûte un appel au modèle par échange : seulement si les règles sans réseau passent.
  if (checksPass(results)) results.push(...(await runScenario({ manifest: app.manifest, knowledge: app.knowledge, ownerId })))
  await repo.creatorApps.saveChecks(app.slug, version, results)
  if (!checksPass(results)) {
    await repo.creatorEvents.log({ slug: app.slug, actorId: ownerId, action: 'submit_rejected', details: { version, failed: results.filter((r) => !r.ok).map((r) => r.check) } })
    throw new DraftError('checks_failed', results)
  }
  await repo.creatorApps.submit(app.slug, { version, termsAcceptedAt: new Date().toISOString() })
  await repo.creatorEvents.log({ slug: app.slug, actorId: ownerId, action: 'submit', details: { version, terms: STUDIO_TERMS_VERSION } })
  const updated = await repo.creatorApps.get(app.slug)
  return { app: updated ?? app, results }
}
