// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PricingCards } from '@/components/billing/pricing-cards'
import { UpgradeCard } from '@/components/billing/upgrade-card'
import { I18nProvider } from '@/lib/i18n/provider'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
afterEach(cleanup)

describe('offre de bienvenue à l écran', () => {
  it('la page tarifs montre le premier mois à 4,50 €, le prix barré, puis 9 €, et le compte à rebours', () => {
    const endsAt = new Date(Date.now() + 47 * 3_600_000 + 12 * 60_000).toISOString()
    render(
      <I18nProvider locale="fr">
        <PricingCards stripeEnabled appSlug="amorce" appName="Amorce" brand={{ from: '#FF7A1A', to: '#FFB347', glyph: 'A' }} hasBilling={false} offer={{ endsAt, percentOff: 50 }} />
      </I18nProvider>
    )
    expect(screen.getByText('4,50 € le premier mois')).toBeTruthy()
    expect(screen.getByText('9 € / mois')).toBeTruthy()
    expect(screen.getByText('puis 9 € / mois, annulable avant')).toBeTruthy()
    expect(screen.getByText(/Encore 47 h 1[12]/)).toBeTruthy()
  })

  it('la carte du menu passe en mode offre avec le temps restant', () => {
    const endsAt = new Date(Date.now() + 2 * 3_600_000).toISOString()
    render(
      <I18nProvider locale="fr">
        <UpgradeCard target="app" appSlug="amorce" brand={{ from: '#FF7A1A', to: '#FFB347' }} trialDaysLeft={null} offer={{ endsAt, percentOff: 50 }} />
      </I18nProvider>
    )
    expect(screen.getByText('Moitié prix, 50 % le premier mois')).toBeTruthy()
    expect(screen.getByText(/Offre de bienvenue : encore (2 h 00|1 h 59)\./)).toBeTruthy()
  })
})
