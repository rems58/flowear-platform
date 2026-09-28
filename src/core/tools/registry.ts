import { tool, type ToolSet } from 'ai'
import type { PlanId } from '@/core/config/defaults'
import type { AppConfig } from '@/core/config/schema'
import type { ToolContext, ToolDefinition } from './types'

const tools = new Map<string, ToolDefinition>()

export function registerTool(def: ToolDefinition<never, unknown> | ToolDefinition): void {
  if (tools.has(def.name)) throw new Error(`Tool déjà enregistré : ${def.name}`)
  tools.set(def.name, def as ToolDefinition)
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name)
}

export function listToolNames(): string[] {
  return Array.from(tools.keys())
}

/** Réservé aux tests : vide le registre. */
export function resetToolRegistry(): void {
  tools.clear()
}

const PLAN_RANK: Record<PlanId, number> = { free: 0, paid: 1 }

/**
 * Tools disponibles pour une app et un plan : activés dans la config résolue
 * (donc après `tools.disabled`), enregistrés, dont le plan requis (surcharge
 * comprise) est couvert par le plan de l'utilisateur, et dont la fonctionnalité
 * exigée, s'il y en a une, est ouverte sur ce plan. Un tool qui a besoin d'une
 * dépendance absente (`available` faux) n'est pas proposé au modèle plutôt que
 * d'échouer à l'appel.
 */
/** Outils que toute IA a, sans les déclarer : la sécurité ne se choisit pas dans un manifeste. */
export const ALWAYS_ON_TOOLS = ['helpline'] as const

export function resolveTools(config: AppConfig, plan: PlanId, available: (def: ToolDefinition) => boolean = () => true): ToolDefinition[] {
  const out: ToolDefinition[] = []
  const names = [...config.tools.enabled, ...ALWAYS_ON_TOOLS.filter((n) => !config.tools.enabled.includes(n))]
  for (const name of names) {
    const def = tools.get(name)
    if (!def) continue
    const required = config.tools.overrides[name]?.requiresPlan ?? def.requiresPlan
    if (PLAN_RANK[plan] < PLAN_RANK[required]) continue
    if (def.requiresFeature && !config.plans[plan]?.[def.requiresFeature]) continue
    if (!available(def)) continue
    out.push(def)
  }
  return out
}

/**
 * Cache des sorties de tools, par nom et entrée, pour les tools qui le demandent.
 * Règle d'architecture : on met en cache les données d'un tool, jamais une réponse finale.
 * En mémoire du processus, borné : une recherche identique dans l'heure ne se paie pas deux fois.
 */
const cache = new Map<string, { until: number; output: unknown }>()
const CACHE_MAX = 500

function cached(key: string, now: number): unknown | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (hit.until < now) {
    cache.delete(key)
    return undefined
  }
  return hit.output
}

function remember(key: string, output: unknown, ttlSeconds: number, now: number): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { until: now + ttlSeconds * 1000, output })
}

/** Réservé aux tests. */
export function resetToolCache(): void {
  cache.clear()
}

export interface ToolCallReport {
  name: string
  ok: boolean
  durationMs: number
  error?: string
}

/**
 * Convertit les définitions en ToolSet pour l'AI SDK, avec le contexte capturé.
 * Chaque exécution est bornée (taille de sortie), protégée (une erreur devient
 * une sortie `{ error }` lisible par le modèle, jamais une exception) et rapportée.
 */
export function toAiToolSet(
  defs: readonly ToolDefinition[],
  ctx: ToolContext,
  options: { maxOutputChars: number; onCall?: (report: ToolCallReport) => void | Promise<void> }
): ToolSet {
  const set: ToolSet = {}
  for (const def of defs) {
    set[def.name] = tool({
      description: def.description,
      inputSchema: def.input,
      execute: async (input: unknown) => {
        const started = Date.now()
        // Le cache est par IA : deux IA ne partagent pas une réponse, même à question égale.
        const key = def.cacheTtlSeconds > 0 ? `${ctx.appSlug}:${def.name}:${JSON.stringify(input)}` : null
        try {
          const hit = key ? cached(key, started) : undefined
          if (hit !== undefined) {
            await options.onCall?.({ name: def.name, ok: true, durationMs: 0 })
            return hit
          }
          const output = await def.execute(input as never, ctx)
          // Une erreur renvoyée au modèle ne se met pas en cache : la prochaine tentative peut réussir.
          if (key && !(output && typeof output === 'object' && 'error' in output)) remember(key, output, def.cacheTtlSeconds, started)
          const size = JSON.stringify(output ?? null).length
          if (size > options.maxOutputChars) {
            await options.onCall?.({ name: def.name, ok: false, durationMs: Date.now() - started, error: 'output_too_large' })
            return { error: 'Résultat trop volumineux, reformule avec moins de contenu.' }
          }
          await options.onCall?.({ name: def.name, ok: true, durationMs: Date.now() - started })
          return output
        } catch (error) {
          const message = error instanceof Error ? error.message : 'erreur inconnue'
          await options.onCall?.({ name: def.name, ok: false, durationMs: Date.now() - started, error: message })
          return { error: "L'outil n'a pas pu s'exécuter. Réponds sans lui." }
        }
      },
    })
  }
  return set
}
