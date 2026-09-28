import { registerTool, getTool, listToolNames, resolveTools, toAiToolSet, resetToolRegistry, resetToolCache } from './registry'
import type { ToolDefinition } from './types'
import { createFiche } from './generic/create-fiche'
import { createComparatif } from './generic/create-comparatif'
import { saveProfile } from './generic/save-profile'
import { saveNote } from './generic/save-note'
import { recallNotes } from './generic/recall-notes'
import { searchKnowledgeTool } from './generic/search-knowledge'
import { searchWebTool } from './generic/search-web'
import { askChoice } from './generic/ask-choice'
import { focusTimer } from './generic/focus-timer'
import { cancelCheckin, scheduleCheckin } from './generic/schedule-checkin'
import { updateTask } from './generic/update-task'
import { assessment } from './generic/assessment'
import { helpline } from './generic/helpline'

/**
 * Enregistrement des tools génériques. Un nouveau tool = son fichier + une ligne ici.
 * Les tools spécifiques à une IA vivent dans `src/apps/<slug>/tools/` et
 * s'enregistrent depuis `registerAppTools()` de cette IA.
 */
export const GENERIC_TOOLS = [createFiche, createComparatif, saveProfile, saveNote, recallNotes, searchKnowledgeTool, searchWebTool, askChoice, focusTimer, scheduleCheckin, cancelCheckin, updateTask, assessment, helpline] as const

let registered = false
/** Fournisseurs d'outils propres à une IA, déclarés par le registre des IA (le cœur ne les connaît pas). */
const providers: (() => readonly ToolDefinition[])[] = []

export function addToolProvider(provider: () => readonly ToolDefinition[]): void {
  if (!providers.includes(provider)) providers.push(provider)
  registered = false
}

export function ensureToolsRegistered(): void {
  if (registered) return
  // Rechargement à chaud en dev : ce module peut être réévalué alors que le registre a survécu.
  for (const def of GENERIC_TOOLS) if (!getTool(def.name)) registerTool(def)
  for (const provider of providers) for (const def of provider()) if (!getTool(def.name)) registerTool(def)
  registered = true
}

/** Réservé aux tests. */
export function resetTools(): void {
  resetToolRegistry()
  resetToolCache()
  registered = false
}

export { getTool, listToolNames, resolveTools, toAiToolSet }
export type { ToolContext, ToolDefinition, ToolRender, PanelRender } from './types'
export { PANEL_RENDERS } from './types'
export type { FicheData } from './generic/create-fiche'
export type { ComparatifData } from './generic/create-comparatif'
export type { AskChoiceData } from './generic/ask-choice'
export type { FocusTimerData } from './generic/focus-timer'
export type { CheckinData } from './generic/schedule-checkin'
export type { AssessmentData } from './generic/assessment'
