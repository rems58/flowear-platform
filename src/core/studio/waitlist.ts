import { z } from 'zod'
import { SUPPORTED_LOCALES } from '@/core/i18n/locale'

/**
 * Flowear Studio (décision du 22 septembre 2026) : la base ouverte aux créateurs, avec Rémy qui
 * forme, vérifie et code au besoin. La page publique ne fait qu'une chose : une liste d'attente.
 * L'entrée réelle se fait par promo, à la main, parmi les inscrits.
 */
export const STUDIO_IDEA_MAX = 300
export const STUDIO_AUDIENCE_MAX = 120

export const studioSignupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  idea: z.string().trim().min(1).max(STUDIO_IDEA_MAX),
  audience: z.string().trim().max(STUDIO_AUDIENCE_MAX).optional(),
  locale: z.enum(SUPPORTED_LOCALES),
})

export type StudioSignupInput = z.infer<typeof studioSignupSchema>

/**
 * Partage de revenus annoncé sur la page (docs/09-business.md § 6 quater), en pourcentage du
 * **revenu net** (après TVA et frais de paiement) ; Flowear paie l'IA. Décision du 22/09/2026 :
 * 70/50 sur le brut ne tenait pas une fois l'IA des gratuits comptée.
 */
/**
 * Part du créateur sur le revenu net de son IA : 50 %, quel que soit qui construit (décision du
 * 24/09/2026 : le système actuel fait le travail technique dans tous les cas, 20 points d'écart ne
 * se justifiaient pas).
 */
/**
 * Le compteur « N créateurs sur la liste » ne s'affiche qu'à partir de ce seuil : un « 0 » ou un
 * « 2 » refroidit plus qu'il ne rassure. En dessous, rien ne s'affiche.
 */
export const STUDIO_COUNTER_MIN = 5

export function showWaitlistCount(count: number): boolean {
  return count >= STUDIO_COUNTER_MIN
}

export const STUDIO_SHARE_PERCENT = 50
/** Gratuit d'une IA créateur : 3 messages par jour (Amorce en a 5), pour que les gratuits coûtent ~2 € par abonné. */
export const CREATOR_FREE_MESSAGES_PER_DAY = 3
