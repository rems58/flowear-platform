import { clerkClient } from '@clerk/nextjs/server'
import type { NextRequest } from 'next/server'
import { accountActionSchema, GIFT_DAYS } from '@/core/admin/actions'
import { BUNDLE_SLUG } from '@/core/billing/entitlements'
import { DEFAULTS } from '@/core/config/defaults'
import { AppError } from '@/lib/api/errors'
import { clientIp, json, rateLimitOrThrow, readJson, requireAdmin, requireUser, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { getAdminIds } from '@/lib/env'
import { getStripe } from '@/lib/stripe'

/**
 * Actions de l'admin sur un compte. Chacune est journalisée avec l'identifiant de l'admin :
 * la demande avant d'agir, l'échec s'il y en a un. Une action sans trace n'existe pas.
 *
 * La suppression exige l'email du compte retapé : elle est irréversible, et c'est le
 * genre de bouton sur lequel on clique une fois de trop. Elle refuse un administrateur,
 * soi-même compris : personne ne se retire son propre accès d'un clic.
 */
export const POST = withRoute<{ id: string }>(async (req: NextRequest, ctx) => {
  const adminId = await requireUser()
  requireAdmin(adminId)
  const ip = clientIp(req)
  await rateLimitOrThrow(`api:${adminId}`, DEFAULTS.rateLimits.apiPerHour, 3_600_000, { userId: adminId, ip, route: 'admin.account' })
  const { id } = await ctx.params
  const userId = decodeURIComponent(id)
  const action = await readJson(req, accountActionSchema, 4_000)
  const repo = getRepo()
  const user = await repo.users.get(userId)
  if (!user) throw AppError.notFound('Personne introuvable')
  const now = new Date()

  // Jamais l'email dans le journal : il survivrait à l'effacement de la personne.
  const details: Record<string, unknown> = { target: userId }
  if (action.action === 'tester' || action.action === 'creator') details.enabled = action.enabled
  if (action.action === 'extend_trial') details.days = action.days
  await repo.audit.require({ userId: adminId, action: `admin_${action.action}`, details, ip })

  try {
    switch (action.action) {
      case 'tester':
        await repo.users.setTester(userId, action.enabled)
        break
      case 'creator':
        await repo.users.setCreator(userId, action.enabled)
        break
      case 'extend_trial': {
        const ok = await repo.subscriptions.extendTrial(userId, BUNDLE_SLUG, action.days, now)
        if (!ok) throw AppError.badRequest('Cette personne n’a jamais eu de semaine d’accueil')
        break
      }
      case 'gift_month':
        await repo.subscriptions.gift(userId, BUNDLE_SLUG, GIFT_DAYS, now)
        break
      case 'reset_quota':
        await repo.users.resetQuota(userId, now)
        break
      case 'delete': {
        if (getAdminIds().has(userId)) throw AppError.forbidden('Un administrateur ne se supprime pas depuis l’admin')
        if (!user.email || user.email.toLowerCase() !== action.confirmEmail.toLowerCase()) throw AppError.badRequest('L’email ne correspond pas')
        // Stripe d'abord : un compte effacé ne doit pas rester facturé sans pouvoir se connecter.
        const stripe = getStripe()
        for (const subscriptionId of await repo.subscriptions.listStripeIds(userId)) {
          if (!stripe) throw AppError.badRequest('Stripe n’est pas configuré : résilier l’abonnement à la main avant de supprimer')
          await stripe.subscriptions.cancel(subscriptionId)
        }
        // Le contenu ensuite, l'identité en dernier : si Clerk échoue, la personne reste
        // visible avec son email et l'admin recommence, le contenu étant déjà parti.
        await repo.users.eraseContent(userId)
        const client = await clerkClient()
        await client.users.deleteUser(userId)
        await repo.users.anonymize(userId)
        break
      }
    }
  } catch (error) {
    await repo.audit.log({ userId: adminId, action: `admin_${action.action}_failed`, details: { target: userId, message: error instanceof Error ? error.message.slice(0, 200) : String(error) }, ip })
    throw error
  }
  await repo.events.track({ name: 'admin_action', userId, props: { action: action.action, by: adminId } })
  return json({ ok: true })
}, 'admin.account')
