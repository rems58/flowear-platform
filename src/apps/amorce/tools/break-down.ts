import { z } from 'zod'
import type { Task } from '@/core/data/types'
import { defineTool } from '@/core/tools/define'

const breakDownInput = z.object({
  taskId: z.string().min(1).max(64).optional().describe('Identifiant de la tâche si elle existe déjà'),
  title: z.string().min(2).max(120).describe('Titre de la tâche (sert à la créer si elle n’existe pas)'),
  steps: z
    .array(z.string().min(2).max(120))
    .min(2)
    .max(12)
    .describe('Étapes minuscules, dans l’ordre, chacune faisable en moins de cinq minutes. La première doit être ridiculement facile'),
  energy: z.enum(['low', 'mid', 'high']).optional(),
  estimateMin: z.number().int().min(1).max(600).optional().describe('Durée estimée du tout, en minutes'),
})

export interface BreakDownData {
  taskId: string
  title: string
  steps: Task['steps']
  estimateMin: number | null
}

/**
 * Découpe une tâche qui bloque en étapes si petites qu'elles en deviennent ridicules.
 * Rappeler l'outil avec les mêmes étapes corrigées remplace le découpage : « trop long »,
 * « pas comme ça » se règlent en une phrase.
 */
export const breakDown = defineTool({
  name: 'break_down',
  description:
    'Découpe une tâche qui bloque en étapes minuscules (la première doit être ridiculement facile : ouvrir l’onglet, sortir la feuille). Si la personne corrige (« trop long », « pas comme ça »), rappelle l’outil avec un nouveau découpage : il remplace l’ancien.',
  input: breakDownInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'steps',
  async execute(input, ctx): Promise<BreakDownData | { error: string }> {
    const steps = input.steps.map((title) => ({ title, done: false }))
    let task = input.taskId ? await ctx.repo.tasks.get(input.taskId, ctx.userId, ctx.appSlug) : null
    if (!task) task = await ctx.repo.tasks.findByTitle(ctx.userId, ctx.appSlug, input.title)
    if (task) {
      const updated = await ctx.repo.tasks.update(task.id, ctx.userId, {
        steps,
        status: task.status === 'done' || task.status === 'dropped' ? 'open' : task.status,
        ...(input.estimateMin ? { estimateMin: input.estimateMin } : {}),
        ...(input.energy ? { energy: input.energy } : {}),
      })
      if (!updated) return { error: 'Tâche introuvable.' }
      return { taskId: updated.id, title: updated.title, steps: updated.steps, estimateMin: updated.estimateMin }
    }
    const [created] = await ctx.repo.tasks.createMany([
      {
        userId: ctx.userId,
        appSlug: ctx.appSlug,
        conversationId: ctx.conversationId,
        title: input.title,
        firstAction: input.steps[0],
        energy: input.energy ?? 'mid',
        estimateMin: input.estimateMin ?? null,
        steps,
      },
    ])
    await ctx.repo.events.track({ name: 'task_created', userId: ctx.userId, appSlug: ctx.appSlug, props: { count: 1, source: 'break_down' } })
    return { taskId: created.id, title: created.title, steps: created.steps, estimateMin: created.estimateMin }
  },
})
