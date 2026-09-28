import 'server-only'
import type { Repo } from '@/core/data/repo'
import type { CreatorApp } from '@/core/data/types'
import { monthlyEarnings } from '@/core/studio/creator-stats'

/** Ligne de la liste admin des créateurs : chiffres agrégés et argent, par IA. */
export async function creatorRow(repo: Repo, app: CreatorApp, now: Date) {
  const [stats, payments, payouts, owner, funnel] = await Promise.all([
    repo.creatorApps.stats(app.slug, now),
    repo.events.listPaymentsForApp(app.slug),
    repo.creatorPayouts.list(app.slug),
    repo.users.get(app.ownerId),
    repo.admin.funnel(app.slug),
  ])
  const money = monthlyEarnings({ payments, payouts, sharePercent: app.sharePercent, now })
  const thisMonth = money.months.find((m) => m.month === now.toISOString().slice(0, 7))
  // Abonnés : le même chiffre que la page partagée (étape « abonné » de l'entonnoir).
  return { app, stats, money, subscribers: funnel[0]?.subscribed ?? 0, thisMonthGross: thisMonth?.grossEur ?? 0, ownerEmail: owner?.email ?? null }
}
