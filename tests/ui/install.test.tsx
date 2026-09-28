// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { InstallBanner } from '@/components/pwa/install-banner'
import { InstallEntry } from '@/components/pwa/install-entry'
import { INSTALL_EVENT_KEY } from '@/lib/pwa/boot'
import { I18nProvider } from '@/lib/i18n/provider'

/**
 * Simule un appareil : c'est le pointeur principal qui décide, pas la taille de l'écran.
 * Un ordinateur a un pointeur fin (souris), un téléphone un pointeur grossier (doigt).
 */
function setDevice({ coarse, touchPoints, ios = false }: { coarse: boolean; touchPoints: number; ios?: boolean }) {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('pointer: coarse') ? coarse : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true })
  Object.defineProperty(navigator, 'userAgent', {
    value: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    configurable: true,
  })
}

/** Les deux présentations rendues ensemble, comme dans le chat : l'une remplace l'autre. */
function renderPrompt() {
  render(
    <I18nProvider locale="fr">
      <InstallBanner slug="remy" appName="Rémy" brand={{ from: '#5E5CE6', to: '#BF5AF2', glyph: 'R' }} />
      <InstallEntry slug="remy" appName="Rémy" />
    </I18nProvider>
  )
}

/** Stockage local minimal : jsdom n'en fournit pas dans cette configuration. */
function installStorage() {
  const map = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    },
  })
}

beforeEach(() => {
  installStorage()
  // Aucun événement en attente par défaut : chaque test pose le sien.
  Object.defineProperty(window, INSTALL_EVENT_KEY, { value: null, configurable: true, writable: true })
})

afterEach(cleanup)

describe('invitation à installer', () => {
  it('ne propose rien sur un ordinateur, même à écran tactile', () => {
    // Souris branchée : le pointeur principal reste fin, il n'y a pas d'écran d'accueil.
    setDevice({ coarse: false, touchPoints: 10 })
    renderPrompt()
    expect(screen.queryByText(/Installer Rémy/)).toBeNull()
  })

  it('explique le geste sur iPhone, où le navigateur ne propose aucun bouton', () => {
    setDevice({ coarse: true, touchPoints: 5, ios: true })
    renderPrompt()
    expect(screen.getByText('Installer Rémy')).toBeTruthy()
    expect(screen.getByText(/Bouton partager/)).toBeTruthy()
  })

  it('attend le feu vert du navigateur sur Android avant de proposer un bouton', () => {
    setDevice({ coarse: true, touchPoints: 5 })
    renderPrompt()
    // Tant que `beforeinstallprompt` n'est pas arrivé, un bouton ne ferait rien.
    expect(screen.queryByText('Installer Rémy')).toBeNull()
  })

  it('rattrape l’annonce d’installation arrivée avant l’hydratation', () => {
    // Le navigateur n'annonce qu'une fois, très tôt : le script d'amorce la met de côté.
    // Sans cette reprise, la bannière ne s'affichait jamais sur Android.
    setDevice({ coarse: true, touchPoints: 5 })
    const stashed = { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'accepted' as const }) }
    Object.defineProperty(window, INSTALL_EVENT_KEY, { value: stashed, configurable: true, writable: true })
    renderPrompt()
    expect(screen.getByText('Installer Rémy')).toBeTruthy()
    expect(screen.getByText('Installer')).toBeTruthy()
  })

  it('fermée, la bannière laisse la place à l’entrée du menu, jamais aux deux', () => {
    setDevice({ coarse: true, touchPoints: 5 })
    Object.defineProperty(window, INSTALL_EVENT_KEY, {
      value: { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'accepted' as const }) },
      configurable: true,
      writable: true,
    })
    window.localStorage.setItem('flowear.install.remy', String(Date.now()))
    renderPrompt()
    // Plus de bannière : son texte d'explication a disparu.
    expect(screen.queryByText(/Plein écran/)).toBeNull()
    // Mais la proposition reste joignable depuis le menu.
    expect(screen.getByText('Installer Rémy')).toBeTruthy()
  })

  it('la bannière revient quand le refus date de plus d’un mois', () => {
    setDevice({ coarse: true, touchPoints: 5, ios: true })
    window.localStorage.setItem('flowear.install.remy', String(Date.now() - 31 * 86_400_000))
    renderPrompt()
    expect(screen.getByText('Installer Rémy')).toBeTruthy()
    // Sur iPhone la bannière porte directement le geste à faire, pas l'argumentaire.
    expect(screen.getByText(/Bouton partager/)).toBeTruthy()
  })

  it('disparaît une fois l’application lancée depuis l’écran d’accueil', () => {
    setDevice({ coarse: true, touchPoints: 5, ios: true })
    vi.spyOn(window, 'matchMedia').mockImplementation(
      ((query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
    )
    renderPrompt()
    expect(screen.queryByText(/Installer Rémy/)).toBeNull()
  })
})
