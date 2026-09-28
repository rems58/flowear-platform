import { z } from 'zod'
import { listApps } from '@/apps/registry'
import { isSettableKey, resolveConfig } from '@/core/config/resolve'
import type { AppSetting } from '@/core/config/schema'

/**
 * Réglages à chaud posés depuis l'admin. Deux familles seulement, celles qui ont un sens
 * sans redéploiement : couper un outil, et déplacer un plafond de plan.
 */
export const settingWriteSchema = z.object({
  // `['all']` en tableau contournerait l'essai à blanc (aucune IA ne s'appelle « all ») puis
  // serait relu comme `'all'` et appliqué partout : seule la forme littérale est acceptée.
  scope: z.union([z.literal('all'), z.array(z.string().regex(/^[a-z0-9-]{2,32}$/).refine((s) => s !== 'all', 'utiliser la portée « all »')).min(1).max(20)]),
  key: z.string().regex(/^[a-zA-Z0-9_.]{1,80}$/).refine(isSettableKey, 'clé non réglable à chaud'),
  value: z.unknown(),
})

export const settingDeleteSchema = settingWriteSchema.pick({ scope: true, key: true })

/** Plafonds de plan proposés dans l'écran, dans cet ordre. */
export const PLAN_LIMIT_KEYS = ['messagesPerDay', 'messagesPerMonth', 'artifactsPerMonth', 'checkinsActive', 'maxUsdPerDay', 'maxUsdPerMonth'] as const

/**
 * Répétition à blanc : on applique le réglage à chaque IA concernée et on laisse le schéma
 * de configuration trancher. Un réglage qui casserait la config d'une IA est refusé avant
 * d'entrer en base, jamais découvert au premier message. C'est une vérification de forme :
 * un plafond à zéro ou un nom de modèle inconnu passent, et se corrigent depuis l'écran.
 */
export function validateSetting(existing: AppSetting[], candidate: AppSetting): { ok: true } | { ok: false; error: string } {
  const merged = [...existing.filter((s) => !(s.key === candidate.key && sameScope(s.scope, candidate.scope))), candidate]
  for (const app of listApps()) {
    try {
      resolveConfig(app, merged)
    } catch (error) {
      return { ok: false, error: `${app.slug} : ${error instanceof Error ? error.message.split('\n')[0] : 'configuration invalide'}` }
    }
  }
  return { ok: true }
}

export function sameScope(a: AppSetting['scope'], b: AppSetting['scope']): boolean {
  if (a === 'all' || b === 'all') return a === b
  return a.length === b.length && a.every((s) => b.includes(s))
}
