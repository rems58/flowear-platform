import type { NextRequest } from 'next/server'
import { pick } from '@/core/i18n/locale'
import { REVIEW_CATEGORY, reportBodySchema, reviewSeverity, severityFor } from '@/core/reports/schema'
import { sanitizeText } from '@/core/security/sanitize'
import { AppError } from '@/lib/api/errors'
import { clientIp, getAppOr404, json, rateLimitOrThrow, readJson, requireAppAccess, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { notifyAdmins } from '@/lib/push/notify-admin'

/**
 * Signalement par une personne : une réponse inacceptable, ou un problème général.
 *
 * Un signalement de message doit porter sur un message de la personne connectée : sinon
 * n'importe qui pourrait viser la conversation de quelqu'un d'autre en devinant un id.
 * La gravité est déduite de la catégorie ; haute, elle réveille le téléphone de l'admin.
 */
export const POST = withRoute<{ app: string }>(async (req: NextRequest, ctx) => {
  const { app: slug } = await ctx.params
  const app = getAppOr404(slug)
  const userId = await requireUser()
  await requireAppAccess(app, userId)
  const ip = clientIp(req)
  // Plus serré que les autres routes : un signalement est rare, un flot en est un lui-même.
  await rateLimitOrThrow(`report:${userId}`, 10, 3_600_000, { userId, ip, route: 'report' })

  const input = await readJson(req, reportBodySchema, 8_000)
  const repo = getRepo()
  let conversationId: string | null = null
  if (input.kind === 'message') {
    const message = await repo.messages.find(input.messageId, userId)
    if (!message || message.role !== 'assistant') throw AppError.notFound('Message introuvable')
    conversationId = message.conversationId
  }
  const body = input.body ? sanitizeText(input.body, 2000) : null
  const category = input.kind === 'review' ? REVIEW_CATEGORY : input.category
  const severity = input.kind === 'review' ? reviewSeverity(input.rating) : severityFor(input.category)
  const report = await repo.reports.create({
    userId,
    appSlug: app.slug,
    conversationId,
    messageId: input.kind === 'message' ? input.messageId : null,
    source: input.kind,
    category,
    severity,
    rating: input.kind === 'review' ? input.rating : null,
    body,
  })
  await repo.events.track({ name: 'report_created', userId, appSlug: app.slug, props: { source: input.kind, category, severity, rating: input.kind === 'review' ? input.rating : undefined } })
  if (severity === 'high') {
    // Sans attendre : la personne a sa confirmation, l'admin sera prévenu dans la foulée.
    void notifyAdmins({
      title: `Signalement sur ${pick(app.name, 'fr')}`,
      body: `${category}${body ? ` : ${body.slice(0, 120)}` : ''}`,
      url: `/admin/boite?s=${report.id}`,
      // Une balise par personne : dix signalements du même compte donnent une notification, pas dix.
      tag: `report-${userId}`,
    }).catch(() => undefined)
  }
  return json({ id: report.id }, 201)
}, 'report')
