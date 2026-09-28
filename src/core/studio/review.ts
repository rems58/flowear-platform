import { z } from 'zod'
import type { Repo } from '@/core/data/repo'
import type { CreatorApp } from '@/core/data/types'
import { appManifestSchema, assessmentSchema } from '@/apps/types'
import { sanitizeCreatorManifest } from './manifest'
import { STUDIO_SHARE_PERCENT } from './waitlist'

/**
 * La liste de contrôle App Store de Rémy : tout coché avant de publier. Elle vit dans le code
 * pour que l'écran de revue et le journal d'audit disent la même chose. Français : admin.
 */
export const REVIEW_CHECKLIST = [
  { id: 'brand', label: 'Nom sans conflit de marque (TMview classes 9, 41, 42, 44), présenté « par Flowear »' },
  { id: 'persona', label: 'La persona ne promet rien, ne diagnostique rien, ne cite aucun numéro' },
  { id: 'suggestions', label: 'Les suggestions envoient des messages complets, jamais un début de phrase' },
  { id: 'assessment', label: 'Le questionnaire, s’il y en a un, cite un instrument validé' },
  { id: 'locales', label: 'Les cinq langues se lisent (ou les langues restreintes sont assumées)' },
  { id: 'scenario', label: 'Le scénario fixe passe à la main, sur Mac et sur téléphone' },
  { id: 'first_step', label: 'Le premier geste demandé est réellement petit, ou l’équivalent pour la niche' },
  { id: 'copyright', label: 'Rien dans les connaissances n’est un contenu copié sans droit (sondé)' },
  { id: 'terms', label: 'Le créateur a accepté les CGU Studio, version courante' },
] as const

export type ChecklistId = (typeof REVIEW_CHECKLIST)[number]['id']

export const reviewDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    /** Chaque point coché, dans l'ordre de `REVIEW_CHECKLIST`. */
    checklist: z.array(z.literal(true)).length(REVIEW_CHECKLIST.length),
    sharePercent: z.literal(STUDIO_SHARE_PERCENT).default(STUDIO_SHARE_PERCENT),
  }),
  z.object({ action: z.literal('request_changes'), notes: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal('suspend'), reason: z.string().trim().min(1).max(2000) }),
])
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>

/** Questionnaires posés par Flowear dans le brouillon : même schéma que les IA du code, source obligatoire. */
export const flowearAssessmentsSchema = z.array(assessmentSchema.and(z.object({ source: z.string().trim().min(1).max(200) }))).max(3)

export class ReviewError extends Error {
  constructor(public readonly code: 'not_found' | 'wrong_status' | 'terms_outdated' | 'invalid_manifest') {
    super(code)
  }
}

/** Statuts depuis lesquels chaque décision est permise. */
const ALLOWED: Record<ReviewDecision['action'], readonly CreatorApp['status'][]> = {
  approve: ['submitted', 'in_review', 'changes_requested'],
  request_changes: ['submitted', 'in_review', 'published'],
  suspend: ['published'],
}

export interface ReviewOutcome {
  app: CreatorApp
  /** Ce que le créateur doit recevoir : la route envoie l'email dans sa langue. */
  mail: 'approved' | 'changes' | 'suspended'
  /** Le registre doit recharger (publication ou suspension). */
  invalidate: boolean
}

/**
 * Applique une décision de revue. Les transitions sont fermées : on ne publie pas un brouillon
 * jamais soumis, on ne suspend pas ce qui n'est pas en ligne. Une IA qui reçoit une demande de
 * changements alors qu'elle est en ligne y reste : c'est son brouillon qui repart en travail.
 */
export async function applyReviewDecision(repo: Repo, input: { slug: string; adminId: string; decision: ReviewDecision; termsVersion: string }): Promise<ReviewOutcome> {
  const app = await repo.creatorApps.get(input.slug)
  if (!app) throw new ReviewError('not_found')
  const { decision } = input
  if (!ALLOWED[decision.action].includes(app.status)) throw new ReviewError('wrong_status')

  switch (decision.action) {
    case 'approve': {
      if (!app.termsAcceptedAt) throw new ReviewError('terms_outdated')
      // Le brouillon a pu changer depuis les vérifications (statut `changes_requested`) : ce qui
      // est publié doit passer le schéma, sinon le registre l'ignorerait en silence.
      if (!appManifestSchema.safeParse(sanitizeCreatorManifest(app.manifest)).success) throw new ReviewError('invalid_manifest')
      await repo.creatorApps.publish(app.slug, input.adminId, { sharePercent: decision.sharePercent })
      await repo.creatorEvents.log({ slug: app.slug, actorId: input.adminId, action: 'publish', details: { version: app.version, sharePercent: decision.sharePercent, checklist: REVIEW_CHECKLIST.map((c) => c.id) } })
      break
    }
    case 'request_changes':
      await repo.creatorApps.requestChanges(app.slug, input.adminId, decision.notes)
      await repo.creatorEvents.log({ slug: app.slug, actorId: input.adminId, action: 'request_changes', details: { version: app.version } })
      break
    case 'suspend':
      await repo.creatorApps.suspend(app.slug, input.adminId, decision.reason)
      await repo.creatorEvents.log({ slug: app.slug, actorId: input.adminId, action: 'suspend', details: { version: app.version } })
      break
  }
  const updated = (await repo.creatorApps.get(app.slug)) ?? app
  return {
    app: updated,
    mail: decision.action === 'approve' ? 'approved' : decision.action === 'suspend' ? 'suspended' : 'changes',
    invalidate: decision.action !== 'request_changes' || app.status === 'published',
  }
}
