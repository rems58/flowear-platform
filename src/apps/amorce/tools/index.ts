import { brainDump } from './brain-dump'
import { breakDown } from './break-down'
import { nextAction } from './next-action'

/** Outils propres à Amorce. Les outils partagés (tâches, minuteur, rappels, choix) vivent dans le cœur. */
export const AMORCE_TOOLS = [brainDump, nextAction, breakDown] as const

export type { BrainDumpData } from './brain-dump'
export type { NextActionData } from './next-action'
export type { BreakDownData } from './break-down'
