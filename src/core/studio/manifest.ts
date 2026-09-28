import { BRAND_IMAGE_MAX, BRAND_IMAGE_RE, type AppManifestInput } from '@/apps/types'
import { CREATOR_FREE_MESSAGES_PER_DAY } from './waitlist'

/**
 * Outils du catalogue qu'un créateur peut cocher. Pas de recherche web au départ (coût,
 * contenu externe), pas d'outil propre à une IA du code, pas d'outil d'administration.
 */
export const CREATOR_TOOL_ALLOWLIST = ['create_fiche', 'create_comparatif', 'save_profile', 'save_note', 'recall_notes', 'search_knowledge', 'ask_choice', 'focus_timer', 'schedule_checkin', 'cancel_checkin', 'update_task', 'assessment', 'helpline'] as const

/** Un logo image n'est gardé que s'il est bien un PNG ou un JPEG en base64, de taille raisonnable. */
function safeImage(image: unknown): image is string {
  return typeof image === 'string' && image.length <= BRAND_IMAGE_MAX && BRAND_IMAGE_RE.test(image)
}

/**
 * Pose (ou retire) les questionnaires construits par Flowear dans un manifeste créateur. Poser un
 * questionnaire active l'outil `assessment` : sans lui, l'IA ne pourrait jamais le faire passer.
 * Le retirer laisse l'outil (inoffensif sans questionnaire, et peut-être voulu par le créateur).
 */
export function withAssessments(manifest: AppManifestInput, assessments: unknown[] | undefined): AppManifestInput {
  const next = { ...manifest } as AppManifestInput & { assessments?: unknown }
  if (assessments === undefined || assessments.length === 0) {
    delete next.assessments
    return next
  }
  next.assessments = assessments as AppManifestInput['assessments']
  const enabled = next.tools?.enabled ?? []
  next.tools = { ...next.tools, enabled: enabled.includes('assessment') ? enabled : [...enabled, 'assessment'] }
  return next
}

export type CreatorTool = (typeof CREATOR_TOOL_ALLOWLIST)[number]

/**
 * Ce que le serveur impose à un manifeste créateur, quoi que contienne la saisie ou la base :
 * `access` public, pas de `brand.mark` (SVG = code du dépôt), pas de `config`, pas de `kill`,
 * pas de `statuses`, plans limités au gratuit créateur, outils filtrés sur la liste blanche.
 * Appliqué à la sauvegarde (`saveCreatorDraft`), au bac à sable et au chargement du registre :
 * une ligne modifiée à la main en base ne peut rien obtenir de plus, et un `brand.mark` ne peut
 * jamais atteindre `AppIcon` (qui l'injecte comme SVG brut) depuis un manifeste créateur.
 */
export function sanitizeCreatorManifest(input: AppManifestInput): AppManifestInput {
  const { brand, tools, ...rest } = input
  // Ces clés sont retirées explicitement, même si le type d'entrée ne les connaît pas toutes.
  const clean = { ...rest } as Record<string, unknown>
  delete clean.config
  delete clean.kill
  delete clean.statuses
  delete clean.plans
  const allow = new Set<string>(CREATOR_TOOL_ALLOWLIST)
  return {
    ...(clean as AppManifestInput),
    access: 'public',
    brand: brand ? { from: brand.from, to: brand.to, glyph: brand.glyph, ...(safeImage(brand.image) ? { image: brand.image } : {}) } : undefined,
    tools: { enabled: (tools?.enabled ?? []).filter((t) => allow.has(t)) },
    plans: { free: { messagesPerDay: CREATOR_FREE_MESSAGES_PER_DAY } },
  }
}
