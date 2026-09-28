import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { DEFAULTS } from '@/core/config/defaults'
import { sanitizeText } from '@/core/security/sanitize'
import { MAX_PROFILE_KEYS } from '@/core/tools/generic/save-profile'
import { AppError } from '@/lib/api/errors'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/
const schema = z.object({
  key: z.string().regex(KEY_RE),
  /** null = oublier ce champ */
  value: z.union([z.string().max(200), z.number().finite(), z.boolean(), z.array(z.string().max(60)).max(10), z.null()]),
})

/**
 * PATCH : la personne corrige ou oublie un champ appris par l'IA.
 * Les réponses d'onboarding se modifient par le formulaire (PUT /profile), pas ici.
 */
export const PATCH = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  await rateLimitOrThrow(`api:${userId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId, ip: clientIp(req), route: 'memory.profile' })
  const body = await readJson(req, schema, 4_000)
  const repo = getRepo()
  const current = await repo.profiles.get(userId, app.slug)
  if (!current) throw AppError.notFound('Profil introuvable')
  if (body.value === null) {
    const p = await repo.profiles.removeKey(userId, app.slug, body.key)
    return json({ profile: p?.data ?? {} })
  }
  if (!(body.key in current.data) && Object.keys(current.data).length >= MAX_PROFILE_KEYS) {
    throw AppError.badRequest(`Profil plein (${MAX_PROFILE_KEYS} champs max)`)
  }
  const value = typeof body.value === 'string' ? sanitizeText(body.value, 200) : body.value
  const p = await repo.profiles.patch(userId, app.slug, { [body.key]: value })
  return json({ profile: p.data })
}, 'memory.profile')
