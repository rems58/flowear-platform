import { describe, expect, it } from 'vitest'
import { renderWaitlistConfirmation } from '@/core/studio/waitlist-email'
import { getMessages } from '@/lib/i18n/messages'

describe('email de confirmation de la liste d’attente Studio', () => {
  const links = { site: 'https://flowear.app' }

  it('invite à créer le compte avec le même email, donne le partage et les conditions', () => {
    const mail = renderWaitlistConfirmation({ email: 'lea@example.com', linked: false }, getMessages('fr'), links)
    expect(mail.subject).toBe('Tu es sur la liste de Flowear Studio')
    expect(mail.text).toContain('lea@example.com')
    expect(mail.text).toContain('https://flowear.app/sign-up?redirect_url=/studio')
    expect(mail.text).toContain('50 %')
    expect(mail.text).toContain('https://flowear.app/studio/conditions')
    expect(mail.html).toContain('href="https://flowear.app/sign-up?redirect_url=/studio"')
  })

  it('sans invitation au compte quand la personne est déjà reliée', () => {
    const mail = renderWaitlistConfirmation({ email: 'lea@example.com', linked: true }, getMessages('fr'), links)
    expect(mail.text).not.toContain('sign-up')
    expect(mail.text).toContain(getMessages('fr').studioMail.linked)
  })

  it('ne porte aucun texte saisi à l’inscription : seule l’adresse, échappée', () => {
    const mail = renderWaitlistConfirmation({ email: 'a"<b>@b.co', linked: false }, getMessages('en'), links)
    expect(mail.html).not.toContain('<b>')
    expect(mail.text).not.toContain(getMessages('fr').studio.idea)
  })

  it('existe dans les cinq langues', () => {
    for (const l of ['en', 'fr', 'es', 'de', 'it'] as const) {
      const mail = renderWaitlistConfirmation({ email: 'a@b.co', linked: false }, getMessages(l), links)
      expect(mail.subject.length).toBeGreaterThan(5)
      expect(mail.text).not.toContain('{')
    }
  })
})

describe('alerte à l’admin pour une nouvelle inscription Studio', () => {
  it('donne l’email, l’idée, l’audience, la langue, l’origine et le lien vers l’admin', async () => {
    const { renderWaitlistAdminAlert } = await import('@/core/studio/waitlist-email')
    const alert = renderWaitlistAdminAlert({ email: 'lea@example.com', idea: 'Un coach sommeil', audience: '12k TikTok', locale: 'fr', utm: { source: 'linkedin', campaign: 'studio' } }, 7, { site: 'https://flowear.app' })
    expect(alert.subject).toBe('Studio : nouvelle inscription (7 sur la liste)')
    expect(alert.text).toContain('lea@example.com')
    expect(alert.text).toContain('Un coach sommeil')
    expect(alert.text).toContain('12k TikTok')
    expect(alert.text).toContain('linkedin / studio')
    expect(alert.text).toContain('https://flowear.app/admin/studio')
    expect(alert.push).toEqual({ title: 'Studio : nouvelle inscription', body: 'lea@example.com : Un coach sommeil', url: '/admin/studio', tag: 'studio-signup' })
  })

  it('échappe tout ce qui a été saisi dans la version HTML', async () => {
    const { renderWaitlistAdminAlert } = await import('@/core/studio/waitlist-email')
    const alert = renderWaitlistAdminAlert({ email: 'a@b.co', idea: '<script>x</script>', audience: null, locale: 'en', utm: null }, 1, { site: 'https://flowear.app' })
    expect(alert.html).not.toContain('<script>')
    expect(alert.html).toContain('&lt;script&gt;')
  })
})
