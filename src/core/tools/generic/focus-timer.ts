import { z } from 'zod'
import { defineTool } from '../define'

const focusTimerInput = z.object({
  minutes: z.number().int().min(1).max(120).describe('Durée du minuteur, en minutes'),
  task: z.string().min(1).max(160).describe('Ce que la personne fait pendant ce temps, en quelques mots'),
})

/** Ce que le chat envoie de la part de la personne quand le minuteur sonne, dans toutes les langues. */
export const TIMER_DONE_PROMPT = '⏱ done'

export interface FocusTimerData {
  minutes: number
  task: string
  startedAt: string
  endsAt: string
}

/**
 * Compte à rebours dans le chat. À la fin, le client envoie « minuteur terminé » de la part
 * de la personne et l'IA reprend : c'est du body doubling, quelqu'un attend. Si la page est
 * fermée, un rappel unique prend le relais par notification, à la précision du cron.
 */
export const focusTimer = defineTool({
  name: 'focus_timer',
  description:
    'Lance un minuteur visible dans le chat (5 à 120 minutes) pour une tâche précise. À la fin, tu es rappelé pour demander comment ça s’est passé. À utiliser quand la personne est prête à s’y mettre, jamais avant qu’elle ait choisi quoi faire.',
  input: focusTimerInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'timer',
  endsTurn: true,
  async execute(input, ctx): Promise<FocusTimerData> {
    const startedAt = ctx.now()
    const endsAt = new Date(startedAt.getTime() + input.minutes * 60_000)
    // Relais si la page est fermée : un rappel unique, à la précision du cron. Le prompt
    // est le même que celui du client : l'IA reprend de la même façon dans les deux cas.
    const devices = await ctx.repo.push.countForApp(ctx.userId, ctx.appSlug)
    if (devices > 0) {
      const hh = String(endsAt.getUTCHours()).padStart(2, '0')
      const mm = String(endsAt.getUTCMinutes()).padStart(2, '0')
      await ctx.repo.checkins.create({
        userId: ctx.userId,
        appSlug: ctx.appSlug,
        kind: 'once',
        timeLocal: `${hh}:${mm}`,
        timezone: 'UTC',
        days: null,
        message: input.task,
        prompt: TIMER_DONE_PROMPT,
        nextRunAt: endsAt.toISOString(),
      })
    }
    return { minutes: input.minutes, task: input.task, startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString() }
  },
})
