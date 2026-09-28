import { auth } from '@clerk/nextjs/server'
import { after, type NextRequest } from 'next/server'
import { studioSignupSchema } from '@/core/studio/waitlist'
import { renderWaitlistAdminAlert, renderWaitlistConfirmation } from '@/core/studio/waitlist-email'
import { sendEmail } from '@/lib/email/resend'
import { getMessages } from '@/lib/i18n/messages'
import { readUtmCookie } from '@/lib/analytics/utm-cookie'
import { clientIp, json, rateLimitOrThrow, readJson, withRoute } from '@/lib/api/guard'
import { getRepo } from '@/lib/db/repo'
import { getAdminIds } from '@/lib/env'
import { notifyAdmins } from '@/lib/push/notify-admin'

/**
 * POST : inscription à la liste d'attente de Flowear Studio. Ouverte aux visiteurs (pas de compte),
 * limitée par adresse, un email compté une fois. Renvoie le nombre d'inscrits pour le compteur, et
 * `linked` si la personne est connectée avec ce même email (son compte est déjà relié).
 */
export const POST = withRoute(async (req: NextRequest) => {
  const ip = clientIp(req)
  await rateLimitOrThrow(`studio:${ip}`, 10, 3_600_000, { ip, route: 'studio' })
  const input = await readJson(req, studioSignupSchema, 4_000)
  const repo = getRepo()
  const utm = await readUtmCookie()
  const result = await repo.studioWaitlist.add({ email: input.email, idea: input.idea, audience: input.audience || null, locale: input.locale, utm })
  if (result === 'added') await repo.events.track({ name: 'studio_signup', userId: null, appSlug: null, props: { locale: input.locale }, utm })
  const count = await repo.studioWaitlist.count()
  // Compte Flowear relié ? Seulement si la personne est connectée avec ce même email : dire à un
  // visiteur anonyme qu'un email a (ou n'a pas) de compte révélerait qui utilise Flowear.
  const { userId } = await auth()
  const me = userId ? await repo.users.get(userId) : null
  const linked = Boolean(me?.email && me.email.toLowerCase() === input.email.toLowerCase())
  // Confirmation par email, une seule fois par adresse (le doublon `exists` n'envoie rien), après
  // la réponse : un envoi lent ou en échec ne bloque jamais l'inscription.
  if (result === 'added') {
    const mail = renderWaitlistConfirmation({ email: input.email, linked }, getMessages(input.locale), { site: 'https://flowear.app' })
    after(() => sendEmail({ to: input.email, ...mail }).then(() => undefined).catch((error) => console.error('[studio] email de confirmation', error instanceof Error ? error.message : error)))
    // Alerte pour l'admin : notification sur le téléphone (abonnement pris depuis /admin) et email
    // à l'adresse de chaque compte administrateur. Même règle : jamais bloquant.
    const alert = renderWaitlistAdminAlert({ email: input.email, idea: input.idea, audience: input.audience || null, locale: input.locale, utm }, count, { site: 'https://flowear.app' })
    after(() => notifyAdmins(alert.push).catch((error) => console.error('[studio] alerte push', error instanceof Error ? error.message : error)))
    after(async () => {
      for (const adminId of getAdminIds()) {
        const to = (await repo.users.get(adminId).catch(() => null))?.email
        if (!to) continue
        await sendEmail({ to, subject: alert.subject, text: alert.text, html: alert.html }).catch((error) => console.error('[studio] alerte email', error instanceof Error ? error.message : error))
      }
    })
  }
  return json({ result, count, linked })
}, 'studio')
