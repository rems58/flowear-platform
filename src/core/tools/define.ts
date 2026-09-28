import type { z } from 'zod'
import { WAITING_RENDERS, type ToolDefinition } from './types'

export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{1,40}$/

/** Valide et fige la définition d'un tool. Lève au chargement si elle est invalide. */
export function defineTool<TInput extends z.ZodType, TOutput>(
  def: ToolDefinition<TInput, TOutput>
): ToolDefinition<TInput, TOutput> {
  if (!TOOL_NAME_RE.test(def.name)) {
    throw new Error(`Nom de tool invalide : « ${def.name} » (attendu : ${TOOL_NAME_RE})`)
  }
  if (def.description.trim().length < 10 || def.description.length > 600) {
    throw new Error(`Description du tool ${def.name} : 10 à 600 caractères`)
  }
  if (def.cacheTtlSeconds < 0) throw new Error(`cacheTtlSeconds négatif pour ${def.name}`)
  // Une carte qui attend un geste clôt le tour, sauf refus explicite (`endsTurn: false`).
  const endsTurn = def.endsTurn ?? (WAITING_RENDERS as readonly string[]).includes(def.render)
  return Object.freeze({ ...def, endsTurn })
}
