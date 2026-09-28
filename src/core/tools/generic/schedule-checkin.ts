import { z } from 'zod'
import { relativeMinutes } from '@/core/checkins/relative'
import { isValidTimezone, localParts, nextRun, TIME_LOCAL_RE } from '@/core/checkins/schedule'
import { defineTool } from '../define'

/** Plafond absolu, tous plans ; le plan réduit en dessous (`limits.checkinsActive`). */
export const MAX_CHECKINS_PER_APP = 6

const scheduleCheckinInput = z.object({
  timeLocal: z.string().regex(TIME_LOCAL_RE).optional().describe('Heure locale de la personne, « HH:MM » sur 24 h, pour un rappel à heure fixe'),
  inMinutes: z.number().int().min(1).max(1440).optional().describe('Rappel unique dans N minutes (« dans 2 minutes », « dans une heure » = 60). Jamais convertir un délai en heure fixe'),
  // Liste vide acceptée (certains modèles l'envoient au lieu d'omettre) : elle vaut « tous les jours ».
  days: z
    .array(z.number().int().min(1).max(7))
    .max(7)
    .optional()
    .describe('Jours de la semaine, 1 = lundi … 7 = dimanche. Absent ou vide = tous les jours'),
  message: z.string().min(3).max(120).describe('Texte de la notification, dans la langue de la personne, chaleureux, jamais culpabilisant'),
  prompt: z.string().min(3).max(200).describe('Ce que la personne te dira en ouvrant la notification, à la première personne (ex. « Mes trois choses du jour »)'),
})

export interface CheckinData {
  id: string
  /** Rappel unique dans N minutes (sinon quotidien à heure fixe). */
  inMinutes?: number
  timeLocal: string
  timezone: string
  days: number[] | null
  message: string
  nextRunAt: string
  /** Aucun navigateur abonné : la personne doit activer les notifications, sinon rien ne partira. */
  pushEnabled: boolean
}

/**
 * Rappel quotidien programmé par la personne. Le fuseau vient du navigateur (contexte) ;
 * sans lui, on refuse plutôt que d'envoyer à une mauvaise heure.
 */
export const scheduleCheckin = defineTool({
  name: 'schedule_checkin',
  description:
    'Programme un rappel par notification : à heure fixe (timeLocal, chaque jour ou certains jours) ou dans N minutes (inMinutes, une seule fois). « Dans 2 minutes » = inMinutes 2, jamais timeLocal 00:02. À utiliser uniquement quand la personne le demande ou accepte explicitement. Dis-lui ensuite d’activer les notifications si pushEnabled est faux.',
  input: scheduleCheckinInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'checkin',
  async execute(input, ctx): Promise<CheckinData | { error: string }> {
    const timezone = ctx.timezone
    if (!timezone || !isValidTimezone(timezone)) return { error: 'Fuseau horaire inconnu : demande à la personne de recharger la page.' }
    // Le délai dit par la personne l'emporte sur ce que le modèle a compris : « dans 2 minutes »
    // devient 00:02 chez lui. Le code relit le message.
    const said = ctx.userText ? relativeMinutes(ctx.userText) : null
    const inMinutes = said ?? input.inMinutes ?? null
    if (inMinutes) {
      const at = new Date(ctx.now().getTime() + inMinutes * 60_000)
      const local = localParts(at, timezone)
      const timeLocal = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`
      const created = await ctx.repo.checkins.create({
        userId: ctx.userId,
        appSlug: ctx.appSlug,
        kind: 'once',
        timeLocal,
        timezone,
        days: null,
        message: input.message,
        prompt: input.prompt,
        nextRunAt: at.toISOString(),
      })
      const devices = await ctx.repo.push.countForApp(ctx.userId, ctx.appSlug)
      return { id: created.id, inMinutes, timeLocal, timezone, days: null, message: created.message, nextRunAt: created.nextRunAt, pushEnabled: devices > 0 }
    }
    if (!input.timeLocal) return { error: 'Il manque l’heure (timeLocal) ou le délai (inMinutes).' }
    const existing = await ctx.repo.checkins.list(ctx.userId, ctx.appSlug)
    const active = existing.filter((c) => c.kind === 'daily' && c.active).length
    const allowed = Math.min(MAX_CHECKINS_PER_APP, ctx.limits?.checkinsActive ?? MAX_CHECKINS_PER_APP)
    if (active >= allowed) {
      await ctx.repo.events.track({ name: 'quota_hit', userId: ctx.userId, appSlug: ctx.appSlug, props: { plan: ctx.plan, reason: 'checkins', limit: allowed } })
      return {
        error:
          ctx.plan === 'free'
            ? `Le plan gratuit garde ${allowed} rappel actif à la fois. Dis-le en une phrase, propose de remplacer l'actuel (cancel_checkin) ou mentionne que l'abonnement en permet plusieurs.`
            : `Déjà ${allowed} rappels : propose d’en retirer un avec cancel_checkin.`,
      }
    }
    const days = input.days && input.days.length ? Array.from(new Set(input.days)).sort() : null
    const nextRunAt = nextRun({ timeLocal: input.timeLocal, timezone, days }, ctx.now())
    const created = await ctx.repo.checkins.create({
      userId: ctx.userId,
      appSlug: ctx.appSlug,
      kind: 'daily',
      timeLocal: input.timeLocal,
      timezone,
      days,
      message: input.message,
      prompt: input.prompt,
      nextRunAt: nextRunAt.toISOString(),
    })
    const devices = await ctx.repo.push.countForApp(ctx.userId, ctx.appSlug)
    return { id: created.id, timeLocal: created.timeLocal, timezone, days, message: created.message, nextRunAt: created.nextRunAt, pushEnabled: devices > 0 }
  },
})

const cancelCheckinInput = z.object({
  id: z.string().min(1).max(64).optional().describe('Identifiant du rappel à retirer ; absent = tous les rappels de cette IA'),
})

export const cancelCheckin = defineTool({
  name: 'cancel_checkin',
  description: 'Retire un rappel programmé (par identifiant), ou tous les rappels de cette IA si aucun identifiant n’est donné. Uniquement à la demande de la personne.',
  input: cancelCheckinInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'text',
  async execute(input, ctx) {
    if (input.id) {
      const ok = await ctx.repo.checkins.remove(input.id, ctx.userId)
      return { removed: ok ? 1 : 0 }
    }
    const all = await ctx.repo.checkins.list(ctx.userId, ctx.appSlug)
    let removed = 0
    for (const c of all) if (await ctx.repo.checkins.remove(c.id, ctx.userId)) removed++
    return { removed }
  },
})
