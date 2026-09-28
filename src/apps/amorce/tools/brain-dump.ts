import { z } from 'zod'
import type { Task, TaskEnergy } from '@/core/data/types'
import { defineTool } from '@/core/tools/define'
import { groundedItems } from '@/core/tools/grounded'

export const MAX_OPEN_TASKS = 60

const item = z.object({
  title: z.string().min(2).max(120).describe('La tâche, reformulée courte et concrète, avec un verbe'),
  firstAction: z.string().min(2).max(160).describe('La toute première action, deux minutes maximum, si petite qu’elle en devient facile'),
  energy: z.enum(['low', 'mid', 'high']).describe('Énergie qu’il faut pour s’y mettre : low = même à plat, mid = normal, high = il faut être en forme'),
  estimateMin: z.number().int().min(1).max(600).optional().describe('Durée estimée en minutes, si tu peux la deviner'),
})

const brainDumpInput = z.object({
  items: z.array(item).min(1).max(20).describe('Ce que tu as extrait du vrac de la personne, une entrée par tâche réelle'),
})

export interface BrainDumpData {
  created: Pick<Task, 'id' | 'title' | 'firstAction' | 'energy' | 'estimateMin'>[]
  /** Titres déjà connus, non recréés. */
  merged: string[]
  /** Le nombre à annoncer : ce qui a été gardé, pas ce qui a été envoyé. */
  createdCount: number
  openCount: number
}

/**
 * « Vide ta tête » : le modèle a déjà transformé le vrac en tâches propres, l'outil les
 * range. Une tâche déjà ouverte au même titre n'est pas dupliquée. Rien n'est demandé à
 * la personne en retour : c'est tout l'intérêt.
 */
export const brainDump = defineTool({
  name: 'brain_dump',
  description:
    'Range ce que la personne vient de vider en vrac : une entrée par tâche réelle, avec sa première action de deux minutes et l’énergie qu’elle demande. À appeler dès que la personne liste plusieurs choses à faire, sans lui poser de question avant. Pas de tâche pour un simple état d’âme. Le nombre à annoncer ensuite est createdCount (ce qui a été gardé), jamais le nombre d’entrées envoyées.',
  input: brainDumpInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'tasks',
  // La carte dit tout (compte, doublons, invitation à choisir) : le modèle ne rajoute rien.
  endsTurn: true,
  async execute(input, ctx): Promise<BrainDumpData | { error: string; silent?: true }> {
    // Seules les tâches présentes dans les mots de la personne sont rangées : le modèle invente
    // une tâche quand le message n'en contient pas (une excuse, un état d'âme).
    const items = groundedItems(input.items, ctx.userText, (it) => `${it.title} ${it.firstAction}`)
    if (items.length === 0) return { error: 'Ce message ne contient aucune tâche : réponds à la personne, sans en créer.', silent: true }
    const open = await ctx.repo.tasks.listOpen(ctx.userId, ctx.appSlug, MAX_OPEN_TASKS + 1)
    if (open.length >= MAX_OPEN_TASKS) return { error: `Déjà ${MAX_OPEN_TASKS} tâches ouvertes : propose d’en jeter quelques-unes avant.` }
    const known = new Map(open.map((t) => [t.title.trim().toLowerCase(), t]))
    const merged: string[] = []
    const fresh: typeof input.items = []
    const seen = new Set<string>()
    for (const it of items) {
      const k = it.title.trim().toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      if (known.has(k)) merged.push(it.title)
      else fresh.push(it)
    }
    const room = Math.max(0, MAX_OPEN_TASKS - open.length)
    const created = await ctx.repo.tasks.createMany(
      fresh.slice(0, room).map((it) => ({
        userId: ctx.userId,
        appSlug: ctx.appSlug,
        conversationId: ctx.conversationId,
        title: it.title,
        firstAction: it.firstAction,
        energy: it.energy as TaskEnergy,
        estimateMin: it.estimateMin ?? null,
      }))
    )
    if (created.length) {
      await ctx.repo.events.track({ name: 'task_created', userId: ctx.userId, appSlug: ctx.appSlug, props: { count: created.length, source: 'brain_dump' } })
    }
    return {
      created: created.map((t) => ({ id: t.id, title: t.title, firstAction: t.firstAction, energy: t.energy, estimateMin: t.estimateMin })),
      merged,
      createdCount: created.length,
      openCount: open.length + created.length,
    }
  },
})
