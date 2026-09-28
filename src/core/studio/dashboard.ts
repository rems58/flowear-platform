import type { Repo } from '@/core/data/repo'
import type { CreatorApp, CreatorStats, ToolRequest } from '@/core/data/types'
import { DraftError, getCreatorApp } from './draft'
import { monthlyEarnings, type MoneyTotals } from './creator-stats'
import { toolRequestSchema } from './economics'

export interface CreatorDashboard {
  status: CreatorApp['status']
  sharePercent: number
  stats: CreatorStats
  earnings: MoneyTotals
  toolRequests: ToolRequest[]
}

/**
 * Ce que le créateur voit de son IA : des agrégats et ce qui lui revient. Aucune donnée
 * individuelle ne passe par ici : la fonction ne lit ni profils, ni conversations, ni notes.
 */
export async function creatorDashboard(repo: Repo, ownerId: string, now: Date): Promise<CreatorDashboard | null> {
  const app = await getCreatorApp(repo, ownerId)
  if (!app) return null
  const [stats, payments, payouts, toolRequests] = await Promise.all([repo.creatorApps.stats(app.slug, now), repo.events.listPaymentsForApp(app.slug), repo.creatorPayouts.list(app.slug), repo.toolRequests.listBySlug(app.slug)])
  return {
    status: app.status,
    sharePercent: app.sharePercent,
    stats,
    earnings: monthlyEarnings({ payments, payouts, sharePercent: app.sharePercent, now }).totals,
    toolRequests: toolRequests.map((r) => ({ ...r, ownerId: '' })),
  }
}

/** Une idée d'outil, attachée à l'IA du créateur connecté et à personne d'autre. */
export async function createToolRequest(repo: Repo, ownerId: string, input: unknown): Promise<ToolRequest> {
  const app = await getCreatorApp(repo, ownerId)
  if (!app) throw new DraftError('not_found')
  const parsed = toolRequestSchema.parse(input)
  return repo.toolRequests.create({ slug: app.slug, ownerId, title: parsed.title, body: parsed.body })
}
