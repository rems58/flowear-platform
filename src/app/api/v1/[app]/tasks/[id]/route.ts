import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { AppError } from '@/lib/api/errors'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

const patchSchema = z.union([
  z.object({ stepIndex: z.number().int().min(0).max(30), done: z.boolean() }),
  z.object({ status: z.enum(['done', 'deferred', 'dropped', 'open']), actualMin: z.number().int().min(1).max(1440).optional() }),
])

/**
 * Cocher une étape ou changer l'état d'une tâche depuis une carte du chat, sans passer
 * par l'IA. La tâche doit appartenir à la personne et à cette IA.
 */
export const PATCH = withRoute<{ app: string; id: string }>(async (req: NextRequest, ctx) => {
  const { app: slug, id } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'tasks.patch' })
  if (!z.string().uuid().safeParse(id).success) throw AppError.notFound('Tâche introuvable')
  const body = await readJson(req, patchSchema, 4_000)
  const repo = getRepo()
  const task = await repo.tasks.get(id, userId, app.slug)
  if (!task) throw AppError.notFound('Tâche introuvable')
  if ('stepIndex' in body) {
    if (!task.steps[body.stepIndex]) throw AppError.notFound('Étape introuvable')
    const steps = task.steps.map((s, i) => (i === body.stepIndex ? { ...s, done: body.done } : s))
    const allDone = steps.length > 0 && steps.every((s) => s.done)
    const updated = await repo.tasks.update(task.id, userId, { steps, ...(allDone ? { status: 'done' as const } : {}) })
    if (allDone && task.status !== 'done') await repo.events.track({ name: 'task_done', userId, appSlug: app.slug, props: { taskId: task.id, via: 'steps' } })
    return json({ id: task.id, steps: updated?.steps ?? steps, status: updated?.status ?? task.status })
  }
  const updated = await repo.tasks.update(task.id, userId, { status: body.status, ...(body.actualMin ? { actualMin: body.actualMin } : {}) })
  if (body.status === 'done' && task.status !== 'done') await repo.events.track({ name: 'task_done', userId, appSlug: app.slug, props: { taskId: task.id, via: 'card' } })
  return json({ id: task.id, status: updated?.status ?? body.status })
}, 'tasks.patch')
