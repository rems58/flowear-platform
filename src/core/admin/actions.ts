import { z } from 'zod'

/**
 * Actions de l'admin sur un compte. Chacune est journalisée avec l'identifiant de l'admin.
 * La suppression demande une confirmation explicite : l'email du compte, retapé.
 */
export const accountActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('tester'), enabled: z.boolean() }),
  z.object({ action: z.literal('creator'), enabled: z.boolean() }),
  z.object({ action: z.literal('extend_trial'), days: z.number().int().min(1).max(30) }),
  z.object({ action: z.literal('gift_month') }),
  z.object({ action: z.literal('reset_quota') }),
  z.object({ action: z.literal('delete'), confirmEmail: z.string().email() }),
])

export type AccountAction = z.infer<typeof accountActionSchema>

/** Durée d'un mois offert. */
export const GIFT_DAYS = 30

/**
 * Début effectif d'une fenêtre de quota : la fenêtre normale, ou la remise à zéro par
 * l'admin si elle est plus récente. L'usage d'avant ne compte plus.
 */
export function quotaSince(windowStart: Date, resetAt: string | null | undefined): Date {
  if (!resetAt) return windowStart
  const reset = new Date(resetAt)
  return reset.getTime() > windowStart.getTime() ? reset : windowStart
}
