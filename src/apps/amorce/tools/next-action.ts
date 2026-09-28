import { z } from 'zod'
import type { Task, TaskEnergy } from '@/core/data/types'
import { defineTool } from '@/core/tools/define'

const nextActionInput = z.object({
  energy: z.enum(['low', 'mid', 'high']).describe('Énergie de la personne là, maintenant : low = à plat, mid = moyen, high = en forme'),
  minutes: z.number().int().min(2).max(480).optional().describe('Temps disponible en minutes, si la personne l’a dit'),
})

export interface NextActionData {
  task: Pick<Task, 'id' | 'title' | 'firstAction' | 'energy' | 'estimateMin' | 'steps'> | null
  /** Rien d’ouvert : il faut d’abord vider la tête. */
  empty: boolean
  openCount: number
}

const RANK: Record<TaskEnergy, number> = { low: 0, mid: 1, high: 2 }

/**
 * Choisit UNE tâche parmi les ouvertes, jamais une liste : celle qui rentre dans l'énergie
 * et le temps du moment. Les reportées passent après les ouvertes, les plus anciennes
 * d'abord, et à égalité la plus courte.
 */
export function pickTask(open: readonly Task[], energy: TaskEnergy, minutes: number | undefined): Task | null {
  const fits = open.filter((t) => RANK[t.energy] <= RANK[energy] && (minutes === undefined || t.estimateMin === null || t.estimateMin <= minutes))
  const pool = fits.length ? fits : open.filter((t) => RANK[t.energy] <= RANK[energy])
  if (pool.length === 0) return null
  return [...pool].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    return (a.estimateMin ?? 999) - (b.estimateMin ?? 999)
  })[0]
}

export const nextAction = defineTool({
  name: 'next_action',
  description:
    'Quand la personne demande quoi faire (« je fais quoi ? », « par où je commence ? »), renvoie UNE seule tâche adaptée à son énergie et à son temps. Si tu ne connais pas son énergie, demande-la d’abord avec ask_choice (à plat / moyen / en forme). Ne propose jamais une liste.',
  input: nextActionInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'task',
  async execute(input, ctx): Promise<NextActionData> {
    const open = await ctx.repo.tasks.listOpen(ctx.userId, ctx.appSlug, 100)
    const task = pickTask(open, input.energy, input.minutes)
    return {
      task: task ? { id: task.id, title: task.title, firstAction: task.firstAction, energy: task.energy, estimateMin: task.estimateMin, steps: task.steps } : null,
      empty: open.length === 0,
      openCount: open.length,
    }
  },
})
