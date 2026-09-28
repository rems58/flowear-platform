import type { z } from 'zod'
import type { AssessmentDefinition } from '@/apps/types'
import type { PlanId } from '@/core/config/defaults'
import type { Repo } from '@/core/data/repo'
import type { KnowledgeChunk } from '@/core/knowledge/search'
import type { WebSearchFn } from '@/core/search/types'

export type ToolCost = 'low' | 'medium' | 'high'

/**
 * Comment le client rend la sortie. `fiche` et `comparatif` ouvrent aussi un panneau
 * (productions gardées) ; les autres sont des cartes dans le fil : question à choix,
 * minuteur, une tâche, une liste de tâches, des étapes, un rappel.
 */
/** Cartes qui attendent un geste (bouton, case, choix) : le modèle n'a rien à dire après. */
export const WAITING_RENDERS = ['choice', 'timer', 'task', 'tasks', 'steps'] as const
export type ToolRender = 'text' | 'fiche' | 'comparatif' | 'choice' | 'timer' | 'task' | 'tasks' | 'steps' | 'checkin' | 'helpline' | 'help'

/** Rendus qui ont un panneau dans le chat : productions gardées (fiches, comparatifs) et la liste des tâches. */
export const PANEL_RENDERS = ['fiche', 'comparatif', 'tasks', 'checkin', 'help'] as const satisfies readonly ToolRender[]
export type PanelRender = (typeof PANEL_RENDERS)[number]

/**
 * Contexte d'exécution d'un tool. Il porte l'identité (userId, appSlug) :
 * un tool ne touche que les données de cet utilisateur dans cette app.
 */
export interface ToolContext {
  userId: string
  appSlug: string
  conversationId: string | null
  locale: string
  /** Fuseau IANA du navigateur, envoyé avec chaque message ; absent = UTC. */
  timezone?: string
  /** Le message de la personne qui a déclenché l'appel : ce qu'un outil crée « à partir de ses mots » doit s'y trouver. */
  userText?: string
  plan: PlanId
  profile: Record<string, unknown>
  repo: Repo
  now: () => Date
  /** Passages de la base de connaissances de l'IA (vide si elle n'en a pas). */
  knowledge: readonly KnowledgeChunk[]
  /** Questionnaires déclarés par le manifeste de l'IA (vide par défaut). */
  assessments?: readonly AssessmentDefinition[]
  /** Bornes du plan de la personne (absent = illimité, tests). */
  limits?: { artifactsPerMonth: number; checkinsActive?: number; assessmentRetake?: boolean }
  /** Recherche web, injectée par la route ; absente sans clé de fournisseur. */
  webSearch?: WebSearchFn
  /** Un tool qui coûte de l'argent le déclare : le montant s'ajoute au coût du message. */
  charge?: (usd: number) => void
}

/** Fonctionnalités de plan qu'un tool peut exiger, en plus du plan lui-même. */
export type PlanFeature = 'webSearch'

/**
 * Contrat unique d'un tool. Ajouter un tool = un fichier `defineTool` + une ligne
 * dans `src/core/tools/index.ts`. L'activer = `tools.enabled` du manifeste.
 */
export interface ToolDefinition<TInput extends z.ZodType = z.ZodType, TOutput = unknown> {
  name: string
  description: string
  input: TInput
  cost: ToolCost
  /** Durée de cache de la sortie, par entrée identique. Zéro = jamais (tout ce qui écrit). */
  cacheTtlSeconds: number
  requiresPlan: PlanId
  /** Le plan doit aussi avoir cette fonctionnalité à vrai (`plans.<plan>.webSearch`). */
  requiresFeature?: PlanFeature
  render: ToolRender
  /**
   * La carte attend une réponse de la personne (question à choix, minuteur) : le tour de
   * l'IA s'arrête dès l'appel, elle ne peut rien écrire après. Sans ça, un modèle bavard
   * répète la question ou redessine les boutons en texte.
   */
  endsTurn?: boolean
  /**
   * Rendus dont la carte attend un geste de la personne : `endsTurn` y est vrai d'office
   * (`defineTool`), pour ne pas dépendre d'une ligne oubliée dans chaque outil.
   */
  execute(input: z.infer<TInput>, ctx: ToolContext): Promise<TOutput>
}
