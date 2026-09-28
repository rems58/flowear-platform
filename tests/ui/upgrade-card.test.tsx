// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { UpgradeCard } from '@/components/billing/upgrade-card'
import { I18nProvider } from '@/lib/i18n/provider'

const brand = { from: '#5E5CE6', to: '#BF5AF2' }

// `globals` n'est pas activé dans vitest.config.mts : le nettoyage automatique de
// testing-library ne s'exécute pas, les rendus s'accumuleraient d'un test à l'autre.
afterEach(cleanup)

function renderCard(trialDaysLeft: number | null, locale: 'fr' | 'en' = 'fr') {
  return render(
    <I18nProvider locale={locale}>
      <UpgradeCard target="app" appSlug="remy" brand={brand} trialDaysLeft={trialDaysLeft} />
    </I18nProvider>
  )
}

describe('UpgradeCard', () => {
  it('mène aux offres de cette IA, avec le dégradé de la marque', () => {
    renderCard(null)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/pricing?app=remy')
    // jsdom normalise les couleurs en rgb.
    expect(link.getAttribute('style')).toContain('rgb(94, 92, 230)')
    expect(link.getAttribute('style')).toContain('rgb(191, 90, 242)')
    expect(screen.getByText('Passe au premium')).toBeTruthy()
    expect(screen.getByText('Voir les offres')).toBeTruthy()
  })

  it('hors semaine d’accueil, elle dit ce que l’abonnement débloque', () => {
    renderCard(null)
    expect(screen.getByText(/gros modèle/)).toBeTruthy()
  })

  it('pendant la semaine d’accueil, elle rappelle l’échéance', () => {
    renderCard(4)
    expect(screen.getByText('Ta semaine d’accueil se termine dans 4 jours.')).toBeTruthy()
  })

  it('le dernier jour, le pluriel disparaît', () => {
    renderCard(1)
    expect(screen.getByText('Ta semaine d’accueil se termine aujourd’hui.')).toBeTruthy()
    cleanup()
    renderCard(0)
    expect(screen.getByText('Ta semaine d’accueil se termine aujourd’hui.')).toBeTruthy()
  })

  it('suit la langue de la personne', () => {
    renderCard(3, 'en')
    expect(screen.getByText('Go premium')).toBeTruthy()
    expect(screen.getByText('Your welcome week ends in 3 days.')).toBeTruthy()
  })
})

describe('UpgradeCard, version bundle', () => {
  it('mène aux offres Flowear sans slug d’IA', () => {
    render(
      <I18nProvider locale="fr">
        <UpgradeCard target="bundle" trialDaysLeft={null} />
      </I18nProvider>
    )
    expect(screen.getByRole('link').getAttribute('href')).toBe('/pricing')
    expect(screen.getByText('Débloque toutes les IA')).toBeTruthy()
    expect(screen.getByText(/présentes et à venir/)).toBeTruthy()
  })
})
