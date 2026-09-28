import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { profileRows } from '@/core/memory/profile-view'
import { sanitizeText } from '@/core/security/sanitize'
import { getLocale } from '@/lib/i18n/server'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/** GET : toute la mémoire de l'utilisateur pour cette IA (profil, notes, productions). */
export const GET = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'memory.get' })
  const repo = getRepo()
  const [profile, notes, artifacts, locale] = await Promise.all([
    repo.profiles.get(userId, app.slug),
    repo.notes.list(userId, app.slug, 200),
    repo.artifacts.list(userId, app.slug, 50),
    getLocale(userId),
  ])
  return json({
    ...profileRows(app, profile?.data ?? {}, locale),
    notes: notes.map((n) => ({ id: n.id, content: n.content, source: n.source, createdAt: n.createdAt })),
    artifacts: artifacts.map((a) => ({ id: a.id, type: a.type, title: a.title, createdAt: a.createdAt })),
  })
}, 'memory.get')

const postSchema = z.object({ content: z.string().min(3).max(300) })

/** POST : la personne ajoute elle-même un souvenir. */
export const POST = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'memory.post' })
  const body = await readJson(req, postSchema, 4_000)
  const note = await getRepo().notes.add(userId, app.slug, sanitizeText(body.content, 300), 'user')
  return json({ id: note.id, content: note.content, source: note.source, createdAt: note.createdAt }, 201)
}, 'memory.post')
