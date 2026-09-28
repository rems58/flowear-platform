import type { NextRequest } from 'next/server'
import { pick, type Locale, isLocale } from '@/core/i18n/locale'
import { DEFAULTS } from '@/core/config/defaults'
import { STUDIO_TERMS_VERSION } from '@/core/studio/draft'
import { ReviewError, applyReviewDecision, reviewDecisionSchema } from '@/core/studio/review'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { invalidateApps } from '@/lib/apps/ensure'
import { getRepo } from '@/lib/db/repo'
import { sendEmail } from '@/lib/email/resend'
import { fmt, getMessages } from '@/lib/i18n/messages'
import { isSafeSlug } from '@/core/security/sanitize'

const SITE = 'https://flowear.app'

/**
 * Décision de revue sur une IA créateur : publier (liste cochée, partage fixé), demander des
 * changements (motif), suspendre (motif). Journalisée avant d'agir, registre invalidé, email
 * au créateur dans sa langue. Aucune décision sans trace.
 */
export const POST = withRoute<{ slug: string }>(async (req: NextRequest, ctx) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.studio.review' })
  const { slug } = await ctx.params
  if (!isSafeSlug(slug)) throw AppError.notFound('IA introuvable')
  const decision = await readJson(req, reviewDecisionSchema, 8_000)
  const repo = getRepo()
  await repo.audit.require({ userId: adminId, action: `creator_${decision.action}`, details: { slug }, ip })

  let outcome
  try {
    outcome = await applyReviewDecision(repo, { slug, adminId, decision, termsVersion: STUDIO_TERMS_VERSION })
  } catch (error) {
    if (error instanceof ReviewError) {
      if (error.code === 'not_found') throw AppError.notFound('IA introuvable')
      throw AppError.badRequest(error.code === 'wrong_status' ? 'Cette décision ne vaut pas pour le statut actuel' : error.code === 'invalid_manifest' ? 'Le brouillon ne passe plus le schéma : demander des changements' : 'CGU non acceptées par le créateur')
    }
    throw error
  }
  if (outcome.invalidate) invalidateApps()

  // Email au créateur, dans sa langue, jamais bloquant : la décision est déjà prise et tracée.
  let email: 'sent' | 'skipped' | 'failed' = 'skipped'
  const owner = await repo.users.get(outcome.app.ownerId)
  if (owner?.email) {
    const locale: Locale = isLocale(owner.locale) ? owner.locale : 'en'
    const t = getMessages(locale).creatorMail
    const name = pick(outcome.app.manifest.name, locale)
    const vars = { name, url: outcome.mail === 'approved' ? `${SITE}/${outcome.app.slug}` : `${SITE}/studio/mon-ia`, share: String(outcome.app.sharePercent), notes: outcome.app.reviewNotes ?? '' }
    const subject = fmt(outcome.mail === 'approved' ? t.approvedSubject : outcome.mail === 'changes' ? t.changesSubject : t.suspendedSubject, vars)
    const text = fmt(outcome.mail === 'approved' ? t.approvedBody : outcome.mail === 'changes' ? t.changesBody : t.suspendedBody, vars)
    try {
      email = await sendEmail({ to: owner.email, subject, text, html: `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` })
    } catch (error) {
      email = 'failed'
      console.error('[admin.studio.review] email', error instanceof Error ? error.message : error)
    }
  }
  return json({ ok: true, status: outcome.app.status, email })
}, 'admin.studio.review')
