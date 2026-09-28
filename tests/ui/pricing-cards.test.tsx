// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PricingCards } from '@/components/billing/pricing-cards'
import { I18nProvider } from '@/lib/i18n/provider'

afterEach(cleanup)

function renderCards(appSlug: string | null, appName: string | null) {
  return render(
    <I18nProvider locale="fr">
      <PricingCards stripeEnabled appSlug={appSlug} appName={appName} hasBilling={false} />
    </I18nProvider>
  )
}

describe('PricingCards', () => {
  it('depuis une IA, seule cette IA est proposée : jamais le bundle', () => {
    renderCards('remy', 'Rémy')
    expect(screen.getByRole('heading', { name: 'Rémy' })).toBeTruthy()
    expect(screen.queryByText('Toutes les IA Flowear')).toBeNull()
    expect(screen.getByText('9 € / mois')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'S’abonner' })).toHaveLength(1)
  })

  it('depuis le hub, seul le bundle est proposé', () => {
    renderCards(null, null)
    expect(screen.getByRole('heading', { name: 'Toutes les IA Flowear' })).toBeTruthy()
    expect(screen.queryByText('Une IA')).toBeNull()
    expect(screen.getByText('30 € / mois')).toBeTruthy()
  })

  it('l’annuel affiche dix mois payés et le rappel du prix mensuel', () => {
    renderCards('remy', 'Rémy')
    fireEvent.click(screen.getByRole('button', { name: 'Annuel' }))
    expect(screen.getByText('90 € / an')).toBeTruthy()
    expect(screen.getByText(/Deux mois offerts/)).toBeTruthy()
    expect(screen.getByText(/9 € \/ mois/)).toBeTruthy()
  })
})
