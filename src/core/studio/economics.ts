import { z } from 'zod'

/**
 * Revenu net = encaissé après TVA et frais de paiement (docs/09-business.md § 6 quater :
 * 9 € encaissés, 6,80 € net). Un ratio unique, appliqué aux montants réels des événements
 * `payment` : une estimation honnête tant que la comptabilité ne fournit pas le net exact.
 */
export const NET_RATIO = 6.8 / 9

export interface CreatorPayment {
  userId: string
  amountCents: number
  createdAt: string
}

export const TOOL_REQUEST_STATUSES = ['open', 'planned', 'done', 'declined'] as const
export type ToolRequestStatus = (typeof TOOL_REQUEST_STATUSES)[number]

/** Une idée d'outil : un titre, une description de ce que l'IA devrait pouvoir faire. */
export const toolRequestSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(2000),
})
export const toolRequestStatusSchema = z.object({ id: z.string().uuid().or(z.string().regex(/^id_\d+$/)), status: z.enum(TOOL_REQUEST_STATUSES) })
