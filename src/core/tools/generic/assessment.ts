import { z } from 'zod'
import { nextQuestion, previousResult, progressKey, readProgress, resultProfilePatch, resultView, scoreAssessment, type AssessmentQuestionView, type AssessmentResultView } from '@/core/assessments/engine'
import { asLocale } from '@/core/memory/system-prompt'
import { defineTool } from '../define'

const assessmentInput = z.object({
  assessmentId: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,30}$/)
    .optional()
    .describe('Identifiant du questionnaire, tel que listé dans tes instructions. Facultatif si un questionnaire est en cours ou si l’IA n’en a qu’un'),
  restart: z.boolean().optional().describe('Vrai pour repartir de la première question (si la personne le demande)'),
})

export type AssessmentData = AssessmentQuestionView | (AssessmentResultView & { canRetake?: boolean }) | { error: string }

/**
 * Déroule un questionnaire déclaré par le manifeste, une question par appel. Les réponses
 * sont enregistrées par le client (route /choice, `saveAs.kind = 'assessment'`) : l'outil
 * lit la progression dans le profil, rend la question suivante, ou le résultat quand tout
 * est répondu, qu'il écrit dans le profil. Le résultat porte sa propre réserve.
 */
export const assessment = defineTool({
  name: 'assessment',
  description:
    'Déroule un questionnaire de l’IA (dépistage, profil) une question à la fois : appelle-le pour poser la première question, puis rappelle-le après chaque réponse de la personne jusqu’au résultat. Ne pose jamais les questions toi-même et ne calcule jamais le résultat toi-même.',
  input: assessmentInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'choice',
  endsTurn: true,
  async execute(input, ctx): Promise<AssessmentData> {
    const locale = asLocale(ctx.locale)
    const now = ctx.now()
    const profile = (await ctx.repo.profiles.get(ctx.userId, ctx.appSlug))?.data ?? {}
    const defs = ctx.assessments ?? []
    // Sans identifiant (le modèle en oublie souvent) : le questionnaire en cours, sinon le seul déclaré.
    const def = input.assessmentId ? defs.find((a) => a.id === input.assessmentId) : (defs.find((a) => readProgress(profile, a.id)) ?? (defs.length === 1 ? defs[0] : undefined))
    if (!def) return { error: 'Questionnaire inconnu.' }
    // Refaire un questionnaire déjà passé : réservé au plan qui le permet. Le premier passage est
    // toujours ouvert ; en cas de refus, on remontre le résultat avec la mention Pro sur la carte.
    const done = Boolean(profile[`${progressKey(def.id)}_done`])
    const canRetake = ctx.limits?.assessmentRetake ?? true
    const restart = input.restart && (canRetake || !done)
    let progress = restart ? null : readProgress(profile, def.id)

    if (!progress) {
      const previous = previousResult(def, profile, now)
      if (previous && (previous.blocked || (input.restart && !canRetake)) && !restart) {
        // Déjà fait récemment : on remontre le résultat, sans refaire passer le test.
        const answers = readProgress({ ...profile, [progressKey(def.id)]: profile[`${progressKey(def.id)}_done`] }, def.id)?.answers ?? {}
        const view = resultView(def, scoreAssessment(def, answers), previous.date, locale)
        if (!canRetake) await ctx.repo.events.track({ name: 'quota_hit', userId: ctx.userId, appSlug: ctx.appSlug, props: { plan: ctx.plan, reason: 'assessment_retake' } })
        return { ...view, canRetake }
      }
      progress = { answers: {}, startedAt: now.toISOString() }
      await ctx.repo.profiles.patch(ctx.userId, ctx.appSlug, { [progressKey(def.id)]: progress })
    }

    const question = nextQuestion(def, progress.answers, locale)
    if (question) return question

    // Tout est répondu : score, profil, et la progression est archivée (pour réafficher le résultat).
    const score = scoreAssessment(def, progress.answers)
    const date = now.toISOString()
    await ctx.repo.profiles.patch(ctx.userId, ctx.appSlug, {
      ...resultProfilePatch(def, score, date),
      [`${progressKey(def.id)}_done`]: progress,
    })
    await ctx.repo.profiles.removeKey(ctx.userId, ctx.appSlug, progressKey(def.id))
    await ctx.repo.events.track({ name: 'memory_saved', userId: ctx.userId, appSlug: ctx.appSlug, props: { source: 'assessment', id: def.id, level: score.levelId } })
    return { ...resultView(def, score, date, locale), canRetake }
  },
})
