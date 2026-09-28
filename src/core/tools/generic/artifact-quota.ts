import { startOfUtcMonth } from '@/core/data/time'
import type { ToolContext } from '../types'

/**
 * Productions (fiches, comparatifs) par mois et par plan. La mémoire et la lecture des
 * productions existantes ne sont jamais bloquées : seule la création l'est.
 * Le modèle reçoit une explication à transmettre en une phrase, pas une erreur brute.
 */
export async function checkArtifactQuota(ctx: ToolContext): Promise<{ ok: true } | { ok: false; error: string }> {
  const limit = ctx.limits?.artifactsPerMonth
  if (limit === undefined) return { ok: true }
  const count = await ctx.repo.artifacts.countSince(ctx.userId, ctx.appSlug, startOfUtcMonth(ctx.now()))
  if (count < limit) return { ok: true }
  await ctx.repo.events.track({ name: 'quota_hit', userId: ctx.userId, appSlug: ctx.appSlug, props: { plan: ctx.plan, reason: 'artifacts', limit } })
  return {
    ok: false,
    error:
      ctx.plan === 'free'
        ? `Quota atteint : ${limit} productions par mois sur le plan gratuit. Réponds en texte, dis-le en une phrase, et mentionne que l'abonnement lève cette limite.`
        : `Quota atteint : ${limit} productions par mois. Réponds en texte et dis-le en une phrase.`,
  }
}
