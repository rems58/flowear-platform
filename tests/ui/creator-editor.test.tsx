// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CreatorEditor } from '@/components/studio/creator/creator-editor'
import type { CreatorApp } from '@/core/data/types'
import { I18nProvider } from '@/lib/i18n/provider'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/studio/mon-ia', useSearchParams: () => new URLSearchParams() }))

const L = (fr: string, en = fr) => ({ en, fr, es: en, de: en, it: en })
const app: CreatorApp = {
  slug: 'sommeil',
  ownerId: 'c1',
  // Une note de revue ne s'affiche que si elle s'adresse au créateur maintenant.
  status: 'changes_requested',
  manifest: {
    slug: 'sommeil',
    name: 'Sommeil',
    tagline: L('Un coach sommeil.'),
    persona: { system: 'court' },
    onboarding: { questions: [{ type: 'choice', key: 'mode', label: L('Mode ?'), options: [{ value: 'a', label: L('A') }, { value: 'b', label: L('B') }] }] },
    tools: { enabled: ['save_profile'] },
    pwa: { shortName: 'Sommeil', themeColor: '#5E5CE6', backgroundColor: '#ffffff' },
  },
  knowledge: [{ name: 'siestes', markdown: '# Siestes' }],
  requests: {},
  version: 1,
  publishedManifest: null,
  publishedKnowledge: null,
  reviewNotes: 'Persona trop courte.',
  reviewedBy: null,
  reviewedAt: null,
  termsAcceptedAt: null,
  sharePercent: 50,
  shareLinkAt: null,
  createdAt: '2026-09-23T10:00:00Z',
  updatedAt: '2026-09-23T10:00:00Z',
  submittedAt: null,
  publishedAt: null,
}

describe('espace créateur', () => {
  afterEach(() => cleanup())

  it('sans IA : le choix de l’adresse, et le bouton reste bloqué tant qu’elle n’est pas disponible', () => {
    render(
      <I18nProvider locale="fr">
        <CreatorEditor initial={null} initialChecks={[]} dashboard={null} />
      </I18nProvider>
    )
    expect((screen.getByText('Créer mon IA') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('mon-ia'), { target: { value: 'Bad Slug' } })
    expect(screen.getByRole('status').textContent).toContain('2 à 32 caractères')
  })

  it('avec une IA : les sections, les règles en direct et les notes de revue', () => {
    render(
      <I18nProvider locale="fr">
        <CreatorEditor initial={app} initialChecks={[]} dashboard={{ status: 'draft', sharePercent: 50, stats: { onboarded: 12, active7d: 3, active30d: 7, messages7d: 40, messages30d: 200 }, earnings: { payingUsers: 2, grossEur: 18, netEur: 13.6, shareEur: 6.8, dueEur: 3.4, pendingEur: 3.4, paidEur: 0, balanceEur: 3.4, advanceEur: 0 }, toolRequests: [{ id: 'id_1', slug: 'sommeil', ownerId: '', title: 'Journal de nuit', body: 'Noter chaque réveil.', status: 'planned', createdAt: '2026-09-23T10:00:00Z' }] }} />
      </I18nProvider>
    )
    expect(screen.getByText('Persona trop courte.')).toBeTruthy()
    // Le tableau de bord s'ouvre en premier : chiffres agrégés, part, demandes d'outils.
    expect(screen.getByText('Ta part : 50 % du revenu net')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('Journal de nuit')).toBeTruthy()
    expect(screen.getByText('Prévue')).toBeTruthy()
    // La règle de longueur échoue sur « court », visible sans rien faire.
    expect(screen.getByText('Longueur de la persona')).toBeTruthy()
    expect(screen.queryByText('Tout passe.')).toBeNull()
    for (const s of ['Identité', 'Premières questions', 'Connaissances', 'Outils', 'Suggestions', 'Bac à sable', 'Soumettre']) expect(screen.getAllByText(s).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Outils' }))
    // Chaque outil est présenté par un nom lisible et un exemple, jamais par son identifiant technique.
    expect(screen.getByText('Ton savoir')).toBeTruthy()
    expect(screen.queryByText('search_knowledge')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Connaissances' }))
    // Un fichier nommé existe : la section s'ouvre en avancé ; passer en simple réunit tout en un texte.
    expect(screen.getByText('Nom du fichier')).toBeTruthy()
    fireEvent.click(screen.getByText('Simple : en mots'))
    expect(screen.getByDisplayValue('# Siestes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Questionnaire' }))
    expect(screen.getByText('Ton questionnaire, en mots')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre' }))
    expect((screen.getByText('Soumettre à la revue') as HTMLButtonElement).disabled).toBe(true)
  })
})
