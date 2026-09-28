import type { NextRequest } from 'next/server'
import { settingDeleteSchema, settingWriteSchema, validateSetting } from '@/core/admin/settings'
import { DEFAULTS } from '@/core/config/defaults'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'

/**
 * Réglages à chaud. Un réglage est d'abord essayé à blanc contre la configuration de
 * chaque IA : s'il la casse, il est refusé ici, jamais découvert au premier message.
 * Appliqué à la requête suivante, sans redéploiement.
 */
export const PUT = withRoute(async (req: NextRequest) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.settings' })
  const setting = await readJson(req, settingWriteSchema, 16_000)
  const repo = getRepo()
  const check = validateSetting(await repo.appSettings.list(), setting)
  if (!check.ok) throw AppError.badRequest(`Réglage refusé : ${check.error}`)
  await repo.audit.require({ userId: adminId, action: 'setting_write', details: { scope: setting.scope, key: setting.key, value: setting.value }, ip })
  await repo.appSettings.upsert(setting, adminId)
  return json({ ok: true })
}, 'admin.settings')

export const DELETE = withRoute(async (req: NextRequest) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.settings' })
  const { scope, key } = await readJson(req, settingDeleteSchema, 4_000)
  const repo = getRepo()
  await repo.audit.require({ userId: adminId, action: 'setting_delete', details: { scope, key }, ip })
  await repo.appSettings.remove(scope, key)
  return json({ ok: true })
}, 'admin.settings')
