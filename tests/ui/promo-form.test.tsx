// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PromoForm } from '@/components/admin/promo-form'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
afterEach(cleanup)

describe('fenêtre promo dans l admin', () => {
  it('ouvre une fenêtre par un réglage global, la ferme en retirant le réglage', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<PromoForm promo={null} welcomeHours={72} />)
    expect(screen.getByText('Aucune fenêtre ouverte.')).toBeTruthy()
    const [from, until] = screen.getAllByDisplayValue('') as HTMLInputElement[]
    fireEvent.change(from, { target: { value: '2026-10-01T09:00' } })
    fireEvent.change(until, { target: { value: '2026-10-03T09:00' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la fenêtre' }))
    })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(init.method).toBe('PUT')
    expect(body.scope).toBe('all')
    expect(body.key).toBe('offers.promo')
    expect(new Date(body.value.from).getTime()).toBeLessThan(new Date(body.value.until).getTime())

    cleanup()
    render(<PromoForm promo={{ from: '2026-10-01T07:00:00.000Z', until: '2026-10-03T07:00:00.000Z' }} welcomeHours={72} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fermer la fenêtre' }))
    })
    const [, del] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(del.method).toBe('DELETE')
    expect(JSON.parse(String(del.body))).toEqual({ scope: 'all', key: 'offers.promo' })
  })
})
