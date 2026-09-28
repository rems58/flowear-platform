// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ChatActionsContext, type ChatActions } from '@/components/chat/chat-actions'
import { ChoiceCard } from '@/components/chat/cards/choice-card'
import { StepsCard, TaskCard } from '@/components/chat/cards/task-cards'
import { TimerCard } from '@/components/chat/cards/timer-card'
import { I18nProvider } from '@/lib/i18n/provider'

afterEach(cleanup)

function withActions(node: React.ReactNode, actions: Partial<ChatActions> = {}) {
  const value: ChatActions = { send: vi.fn(), appSlug: 'amorce', busy: false, ...actions }
  const utils = render(
    <I18nProvider locale="fr">
      <ChatActionsContext.Provider value={value}>{node}</ChatActionsContext.Provider>
    </I18nProvider>
  )
  return { ...utils, value }
}

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ saved: true }), { status: 200 }))
beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

describe('ChoiceCard', () => {
  const data = { question: 'Ton énergie là ?', options: [{ value: 'low', label: 'À plat' }, { value: 'mid', label: 'Moyen' }], saveAs: { kind: 'profile', key: 'energy' } as const, allowOther: true as const }

  it('enregistre puis envoie le choix cliqué, et se fige ensuite', async () => {
    const { value } = withActions(<ChoiceCard data={data} active />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'À plat' }))
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/amorce/choice')
    expect(JSON.parse(String(init.body))).toMatchObject({ answer: 'À plat', saveAs: { kind: 'profile', key: 'energy' } })
    expect(value.send).toHaveBeenCalledWith('À plat')
    expect((screen.getByRole('button', { name: 'Moyen' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('« autre » ouvre un champ libre dont la réponse part comme un message', async () => {
    const { value } = withActions(<ChoiceCard data={{ ...data, saveAs: { kind: 'none' } }} active />)
    fireEvent.click(screen.getByRole('button', { name: 'Autre' }))
    const input = screen.getByPlaceholderText('Écris ta réponse')
    fireEvent.change(input, { target: { value: 'Crevé mais motivé' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(value.send).toHaveBeenCalledWith('Crevé mais motivé')
  })

  it('une carte qui n est pas dans la dernière réponse est figée', () => {
    withActions(<ChoiceCard data={data} active={false} />)
    expect((screen.getByRole('button', { name: 'À plat' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('TaskCard', () => {
  const data = { task: { id: 't1', title: 'Appeler le dentiste', firstAction: 'Chercher le numéro', energy: 'low' as const, estimateMin: 5, steps: [] }, empty: false, openCount: 3 }

  it('montre la première action en grand, met la tâche à jour puis envoie « Fait : … » au clic', async () => {
    const { value } = withActions(<TaskCard data={data} active />)
    expect(screen.getByText('Chercher le numéro')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fait' }))
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/amorce/tasks/t1')
    expect(JSON.parse(String(init.body))).toEqual({ status: 'done' })
    expect(value.send).toHaveBeenCalledWith('Fait : Appeler le dentiste')
    expect((screen.getByRole('button', { name: 'Plus tard' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('sans tâche ouverte, invite à vider la tête', () => {
    withActions(<TaskCard data={{ task: null, empty: true, openCount: 0 }} active />)
    expect(screen.getByText(/Vide d’abord/)).toBeTruthy()
  })
})

describe('StepsCard', () => {
  it('coche une étape par la route, et fête la dernière par un message', async () => {
    const data = { taskId: '11111111-1111-4111-8111-111111111111', title: 'Le mail', steps: [{ title: 'Ouvrir la boîte', done: true }, { title: 'Écrire une ligne', done: false }], estimateMin: null }
    const { value } = withActions(<StepsCard data={data} active />)
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes[0].checked).toBe(true)
    await act(async () => {
      fireEvent.click(boxes[1])
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/amorce/tasks/${data.taskId}`)
    expect(JSON.parse(String(init.body))).toEqual({ stepIndex: 1, done: true })
    expect(value.send).toHaveBeenCalledWith('J’ai fini toutes les étapes de : Le mail')
    expect(screen.getByText('Tout est fait')).toBeTruthy()
  })
})

describe('TimerCard', () => {
  it('sonne à la fin et envoie « ⏱ done » une seule fois, seulement si la carte est active', () => {
    vi.useFakeTimers()
    const now = new Date('2026-09-17T08:00:00Z')
    vi.setSystemTime(now)
    const data = { minutes: 1, task: 'Le mail', startedAt: now.toISOString(), endsAt: new Date(now.getTime() + 60_000).toISOString() }
    const { value } = withActions(<TimerCard data={data} active />)
    expect(screen.getByText('1:00')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    expect(screen.getByText('Temps écoulé')).toBeTruthy()
    expect(value.send).toHaveBeenCalledTimes(1)
    expect(value.send).toHaveBeenCalledWith('⏱ done')
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(value.send).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('un minuteur fini depuis longtemps ne relance rien', () => {
    const data = { minutes: 15, task: 'x', startedAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-01T00:15:00Z' }
    const { value } = withActions(<TimerCard data={data} active />)
    expect(screen.getByText('Temps écoulé')).toBeTruthy()
    expect(value.send).not.toHaveBeenCalled()
  })
})
