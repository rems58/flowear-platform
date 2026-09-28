// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ChatSwitcher } from '@/components/chat/chat-switcher'
import { I18nProvider } from '@/lib/i18n/provider'
import type { PublicApp } from '@/lib/public-app'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/amorce', useSearchParams: () => new URLSearchParams() }))
vi.mock('@clerk/nextjs', () => ({ UserButton: () => null }))

afterEach(cleanup)

const app: PublicApp = {
  slug: 'amorce',
  name: 'Amorce',
  tagline: 'Tu sais quoi faire.',
  access: 'private',
  category: 'assistant',
  brand: { from: '#FF7A1A', to: '#FFB347', glyph: 'A' },
  onboarding: { questions: [] },
  pwa: { shortName: 'Amorce', themeColor: '#111111', backgroundColor: '#ffffff' },
  panels: [],
  suggestions: [],
}
const access = { plan: 'paid' as const, trialDaysLeft: null, trialEndedRecently: false, messagesToday: 0, messagesPerDay: 100, messagesMonth: 0, messagesPerMonth: 1000 }
const stored = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Bonjour ancienne' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Réponse ancienne' }], feedback: 'up' },
]

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/conversations/c-old')) return new Response(JSON.stringify({ data: { conversation: { id: 'c-old' }, messages: stored } }), { status: 200 })
    return new Response(JSON.stringify({ data: {} }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window.history, 'pushState')
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  window.scrollTo = (() => undefined) as typeof window.scrollTo
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
})

function mount() {
  return render(
    <I18nProvider locale="fr">
      <ChatSwitcher
        app={app}
        chatKey="new-1"
        conversationId={null}
        initialMessages={[]}
        initialFeedback={{}}
        conversations={[{ id: 'c-old', title: 'Ancienne', updatedAt: '2026-09-18T10:00:00Z', pinned: false }]}
        firstName="Rémy"
        access={access}
        pushEnabled={false}
      />
    </I18nProvider>
  )
}

describe('changement de conversation sans le serveur de page', () => {
  it('ouvre une ancienne conversation par l API, puis une nouvelle vide, l adresse suivant à chaque fois', async () => {
    mount()
    expect(screen.queryByText('Réponse ancienne')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getAllByRole('link', { name: /Ancienne/ })[0])
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/amorce/conversations/c-old')
    expect(screen.getByText('Réponse ancienne')).toBeTruthy()
    expect(window.history.pushState).toHaveBeenCalledWith({ c: 'c-old' }, '', '/amorce?c=c-old')

    await act(async () => {
      fireEvent.click(screen.getAllByLabelText('Nouvelle conversation')[0])
    })
    expect(screen.queryByText('Réponse ancienne')).toBeNull()
    expect(window.history.pushState).toHaveBeenCalledWith({ c: null }, '', '/amorce')
    // Aucun rendu serveur demandé : un seul appel réseau, celui de la conversation.
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/conversations/')).length).toBe(1)
  })
})
