import { z } from 'zod'
import { MESSAGE_ID_RE } from '@/core/security/sanitize'

/**
 * Signalements. Deux portes côté personne, une porte automatique.
 *
 * Le pouce bas dit « pas utile », un signalement dit « pas acceptable » : les deux ne se
 * mélangent pas, parce qu'ils n'appellent pas la même réaction. Un pouce bas nourrit une
 * statistique, un signalement réclame quelqu'un.
 */
export const MESSAGE_CATEGORIES = ['false', 'dangerous', 'inappropriate', 'other'] as const
export const CONTACT_CATEGORIES = ['bug', 'payment', 'question'] as const
export const SYSTEM_CATEGORIES = ['stripe_dispute', 'stripe_payment_failed', 'cost_alert', 'error_spike', 'provider_fallback'] as const

/** Avis libre depuis le menu : une note sur cinq et, si la personne veut, quelques mots. */
export const REVIEW_CATEGORY = 'review'
export const REPORT_SOURCES = ['message', 'contact', 'review', 'system'] as const
export const REPORT_SEVERITIES = ['low', 'medium', 'high'] as const
export const REPORT_STATUSES = ['new', 'seen', 'resolved'] as const
export type ReportSource = (typeof REPORT_SOURCES)[number]
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number]
export type ReportStatus = (typeof REPORT_STATUSES)[number]

/**
 * Gravité, déduite de la catégorie plutôt que choisie par la personne : demander « c'est
 * grave ? » à quelqu'un qui se plaint donne toujours la même réponse. La gravité haute
 * déclenche une notification immédiate vers l'admin.
 */
const SEVERITY: Record<string, ReportSeverity> = {
  dangerous: 'high',
  inappropriate: 'high',
  false: 'medium',
  other: 'low',
  payment: 'high',
  bug: 'medium',
  question: 'low',
  review: 'low',
  stripe_dispute: 'high',
  stripe_payment_failed: 'medium',
  cost_alert: 'medium',
  error_spike: 'high',
  provider_fallback: 'low',
}

export function severityFor(category: string): ReportSeverity {
  return SEVERITY[category] ?? 'low'
}

/** Un avis à une ou deux étoiles mérite un œil humain ; au-delà, c'est une statistique. */
export function reviewSeverity(rating: number): ReportSeverity {
  return rating <= 2 ? 'medium' : 'low'
}

/** Corps accepté par `POST /api/v1/<app>/report`. */
export const reportBodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('message'),
    messageId: z.string().regex(MESSAGE_ID_RE),
    category: z.enum(MESSAGE_CATEGORIES),
    body: z.string().trim().max(2000).optional(),
  }),
  z.object({
    kind: z.literal('contact'),
    category: z.enum(CONTACT_CATEGORIES),
    body: z.string().trim().min(3).max(2000),
  }),
  z.object({
    kind: z.literal('review'),
    rating: z.number().int().min(1).max(5),
    body: z.string().trim().max(2000).optional(),
  }),
])

export type ReportBody = z.infer<typeof reportBodySchema>

/** Ce que l'admin peut changer sur un signalement. */
export const reportPatchSchema = z.object({
  status: z.enum(REPORT_STATUSES),
  resolution: z.string().trim().max(1000).optional(),
})
