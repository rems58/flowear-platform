import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { progressKey, readProgress } from '@/core/assessments/engine'
import { CHOICE_KEY_RE } from '@/core/tools/generic/ask-choice'
import { MAX_PROFILE_KEYS } from '@/core/tools/generic/save-profile'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

const bodySchema = z.object({
  question: z.string().min(1).max(200),
  answer: z.string().trim().min(1).max(200),
  saveAs: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('profile'), key: z.string().regex(CHOICE_KEY_RE) }),
    z.object({ kind: z.literal('note') }),
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('assessment'), id: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/), key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/), value: z.string().min(1).max(40) }),
  ]),
})

/**
 * Réponse à une question à choix (ask_choice). Le client enregistre lui-même la réponse
 * là où l'outil l'a demandé, puis l'envoie au chat : l'IA n'a rien à refaire, et la
 * réponse est gardée même si l'IA oublie de le faire.
 */
export const POST = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'choice' })
  const body = await readJson(req, bodySchema, 4_000)
  const repo = getRepo()
  if (body.saveAs.kind === 'assessment') {
    // Réponse à une question de questionnaire : la valeur doit être une option de cette question.
    const { id, key, value } = body.saveAs
    const def = app.assessments.find((a) => a.id === id)
    const question = def?.questions.find((q) => q.key === key)
    if (!def || !question || !question.options.some((o) => o.value === value)) return json({ saved: false, reason: 'unknown_question' })
    const profile = (await repo.profiles.get(userId, app.slug))?.data ?? {}
    const progress = readProgress(profile, def.id) ?? { answers: {}, startedAt: new Date().toISOString() }
    progress.answers[question.key] = value
    await repo.profiles.patch(userId, app.slug, { [progressKey(def.id)]: progress })
    return json({ saved: true })
  }
  if (body.saveAs.kind === 'profile') {
    const current = (await repo.profiles.get(userId, app.slug))?.data ?? {}
    // Même borne que save_profile : une question ne peut pas faire déborder le profil.
    if (!(body.saveAs.key in current) && Object.keys(current).length >= MAX_PROFILE_KEYS) return json({ saved: false, reason: 'profile_full' })
    // La date de la réponse, en clé technique (jamais dans le prompt) : sert à savoir si une
    // information du moment (l'énergie) est encore fraîche.
    await repo.profiles.patch(userId, app.slug, { [body.saveAs.key]: body.answer, [`_${body.saveAs.key}_at`]: new Date().toISOString() })
    await repo.events.track({ name: 'memory_saved', userId, appSlug: app.slug, props: { source: 'ask_choice', key: body.saveAs.key } })
    return json({ saved: true })
  }
  if (body.saveAs.kind === 'note') {
    await repo.notes.add(userId, app.slug, `${body.question} : ${body.answer}`, 'ai')
    await repo.events.track({ name: 'memory_saved', userId, appSlug: app.slug, props: { source: 'ask_choice' } })
    return json({ saved: true })
  }
  return json({ saved: false })
}, 'choice')
