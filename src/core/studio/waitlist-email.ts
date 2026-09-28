import type { Messages } from '@/lib/i18n/messages'
import { fmt } from '@/lib/i18n/messages'
import { STUDIO_SHARE_PERCENT } from './waitlist'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Email de confirmation après une inscription sur la liste d'attente Studio : l'invitation à créer le compte avec le même email (sauf si la personne est déjà reliée), ce qui
 * se passe ensuite, le partage et les conditions. Aucun texte saisi n'y figure : n'importe qui peut
 * inscrire l'adresse d'un autre, l'email ne doit rien porter qui vienne de l'inscription.
 */
export function renderWaitlistConfirmation(input: { email: string; linked: boolean }, t: Messages, links: { site: string }): { subject: string; text: string; html: string } {
  const m = t.studioMail
  const signUp = `${links.site}/sign-up?redirect_url=/studio`
  const terms = `${links.site}/studio/conditions`
  const share = fmt(m.share, { share: STUDIO_SHARE_PERCENT, url: terms })

  const text = [
    m.hello,
    '',
    m.nextTitle,
    ...(input.linked ? [m.linked] : [fmt(m.account, { email: input.email }), `${m.accountCta} : ${signUp}`]),
    '',
    m.read,
    '',
    share,
    '',
    m.footer,
  ].join('\n')

  const p = (s: string, style = '') => `<p style="margin:0 0 16px${style}">${s}</p>`
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;line-height:1.5">${[
    p(escapeHtml(m.hello)),
    `<h2 style="font-size:16px;margin:24px 0 8px">${escapeHtml(m.nextTitle)}</h2>`,
    ...(input.linked
      ? [p(escapeHtml(m.linked))]
      : [
          p(escapeHtml(fmt(m.account, { email: input.email }))),
          p(`<a href="${escapeHtml(signUp)}" style="display:inline-block;background:#5E5CE6;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:600">${escapeHtml(m.accountCta)}</a>`),
        ]),
    p(escapeHtml(m.read)),
    p(`${escapeHtml(fmt(m.share, { share: STUDIO_SHARE_PERCENT, url: '' })).trim()} <a href="${escapeHtml(terms)}">${escapeHtml(terms)}</a>`),
    p(escapeHtml(m.footer), ';margin-top:32px;font-size:12px;color:#999'),
  ].join('')}</body></html>`

  return { subject: m.subject, text, html }
}

/**
 * Alerte pour l'admin à chaque nouvelle inscription : de quoi juger le profil sans ouvrir l'admin
 * (email, idée, audience, langue, origine), plus le lien vers la liste. En français (admin), texte
 * saisi échappé dans le HTML. `push` sert la notification du téléphone (même tag : les alertes se
 * remplacent au lieu de s'empiler).
 */
export function renderWaitlistAdminAlert(
  signup: { email: string; idea: string; audience: string | null; locale: string; utm: Record<string, string> | null },
  count: number,
  links: { site: string }
): { subject: string; text: string; html: string; push: { title: string; body: string; url: string; tag: string } } {
  const admin = `${links.site}/admin/studio`
  const origin = signup.utm ? [signup.utm.source, signup.utm.campaign].filter(Boolean).join(' / ') : ''
  const rows: [string, string][] = [
    ['Email', signup.email],
    ['Idée', signup.idea],
    ['Audience', signup.audience ?? '(non précisée)'],
    ['Langue', signup.locale],
    ['Origine', origin || '(directe)'],
  ]
  const text = [...rows.map(([k, v]) => `${k} : ${v}`), '', `Voir la liste : ${admin}`].join('\n')
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;line-height:1.5"><table style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join('')}</table><p style="margin-top:24px"><a href="${escapeHtml(admin)}">Voir la liste d’attente</a></p></body></html>`
  return {
    subject: `Studio : nouvelle inscription (${count} sur la liste)`,
    text,
    html,
    push: { title: 'Studio : nouvelle inscription', body: `${signup.email} : ${signup.idea}`.slice(0, 160), url: '/admin/studio', tag: 'studio-signup' },
  }
}
