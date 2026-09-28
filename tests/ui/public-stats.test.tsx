// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicStatsView } from '@/components/studio/public-stats-view'
import { buildPublicStats } from '@/core/studio/creator-stats'
import { getMessages } from '@/lib/i18n/messages'

const L = (fr: string) => ({ en: fr, fr, es: fr, de: fr, it: fr })

describe('page de statistiques partagée', () => {
  it('une seule page : aucun lien, aucun bouton, aucun formulaire, rien vers le reste de Flowear', () => {
    const data = buildPublicStats({
      app: { slug: 'sommeil', status: 'published', sharePercent: 50, manifest: { slug: 'sommeil', name: 'Sommeil', tagline: L('Un coach.'), persona: { system: 'x' }, onboarding: { questions: [] }, tools: { enabled: [] }, pwa: { shortName: 'S', themeColor: '#5E5CE6', backgroundColor: '#ffffff' } } as never },
      stats: { onboarded: 4, active7d: 2, active30d: 3, messages7d: 10, messages30d: 40 },
      funnel: undefined,
      cohorts: [],
      payments: [{ userId: 'user_x', amountCents: 900, createdAt: '2026-09-10T10:00:00Z' }],
      payouts: [],
      now: new Date('2026-11-15T12:00:00Z'),
      locale: 'fr',
    })
    const html = renderToStaticMarkup(<PublicStatsView data={data} t={getMessages('fr').stats} locale="fr" />)
    expect(html).not.toMatch(/<a[\s>]/)
    expect(html).not.toMatch(/<button[\s>]/)
    expect(html).not.toMatch(/<form[\s>]/)
    expect(html).not.toContain('user_x')
    expect(html).toContain('Sommeil')
    expect(html).toContain('50 %')
  })
})
