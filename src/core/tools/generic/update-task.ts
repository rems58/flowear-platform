import { z } from 'zod'
import { defineTool } from '../define'

const updateTaskInput = z.object({
  taskId: z.string().min(1).max(64).describe('Identifiant de la tâche (donné par les outils de tâches)'),
  status: z.enum(['done', 'deferred', 'dropped', 'open']).describe('done = faite, deferred = reportée sans date, dropped = jetée (elle ne reviendra jamais), open = reprise'),
  actualMin: z.number().int().min(1).max(1440).optional().describe('Temps réellement passé, en minutes, si la personne le dit'),
  stepIndex: z.number().int().min(0).max(30).optional().describe('Pour cocher une seule étape plutôt que toute la tâche'),
})

/**
 * Change l'état d'une tâche : faite, reportée, jetée, ou une étape cochée. Le temps réel,
 * quand la personne le donne, nourrit son coefficient de temps.
 */
export const updateTask = defineTool({
  name: 'update_task',
  description:
    'Marque une tâche faite, reportée ou jetée, ou coche une de ses étapes (stepIndex). Note le temps réel (actualMin) quand la personne le dit. Ne jamais reprocher une tâche non faite : reporter ou jeter sont des issues normales. remainingOpen dit combien de tâches restent : s’il en reste, propose la suivante.',
  input: updateTaskInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'text',
  async execute(input, ctx) {
    const task = await ctx.repo.tasks.get(input.taskId, ctx.userId, ctx.appSlug)
    if (!task) return { error: 'Tâche introuvable.' }
    if (input.stepIndex !== undefined) {
      if (!task.steps[input.stepIndex]) return { error: 'Étape introuvable.' }
      const steps = task.steps.map((s, i) => (i === input.stepIndex ? { ...s, done: true } : s))
      const allDone = steps.every((s) => s.done)
      const updated = await ctx.repo.tasks.update(task.id, ctx.userId, { steps, ...(allDone ? { status: 'done' as const } : {}) })
      return { taskId: task.id, title: task.title, steps: updated?.steps ?? steps, status: updated?.status ?? task.status }
    }
    const updated = await ctx.repo.tasks.update(task.id, ctx.userId, { status: input.status, ...(input.actualMin ? { actualMin: input.actualMin } : {}) })
    if (input.status === 'done') {
      await ctx.repo.events.track({ name: 'task_done', userId: ctx.userId, appSlug: ctx.appSlug, props: { taskId: task.id, actualMin: input.actualMin ?? null, estimateMin: task.estimateMin } })
    }
    const [stats, open] = await Promise.all([ctx.repo.tasks.timeStats(ctx.userId, ctx.appSlug), ctx.repo.tasks.listOpen(ctx.userId, ctx.appSlug, 100)])
    // Ce qu'il reste : l'IA propose la suite (une seule tâche, selon l'énergie) tant qu'il y en a.
    return { taskId: task.id, title: task.title, status: updated?.status ?? input.status, timeRatio: stats.ratio, measured: stats.measured, remainingOpen: open.length }
  },
})
