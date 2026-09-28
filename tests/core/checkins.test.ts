import { describe, expect, it } from 'vitest'
import { buildCheckinPayload } from '@/core/checkins/run'
import { serializePayload } from '@/core/push/nudge'
import { isValidTimezone, localParts, nextRun, zonedToUtc } from '@/core/checkins/schedule'

describe('schedule', () => {
  it('convertit une heure locale de Paris en UTC, été et hiver', () => {
    expect(zonedToUtc({ year: 2026, month: 7, day: 1, hour: 8, minute: 30 }, 'Europe/Paris').toISOString()).toBe('2026-07-01T06:30:00.000Z')
    expect(zonedToUtc({ year: 2026, month: 1, day: 15, hour: 8, minute: 30 }, 'Europe/Paris').toISOString()).toBe('2026-01-15T07:30:00.000Z')
  })

  it('donne le prochain passage du jour si l heure n est pas passée, sinon le lendemain', () => {
    const from = new Date('2026-09-17T05:00:00Z') // 7 h à Paris
    expect(nextRun({ timeLocal: '08:30', timezone: 'Europe/Paris', days: null }, from).toISOString()).toBe('2026-09-17T06:30:00.000Z')
    const later = new Date('2026-09-17T07:00:00Z') // 9 h à Paris
    expect(nextRun({ timeLocal: '08:30', timezone: 'Europe/Paris', days: null }, later).toISOString()).toBe('2026-09-18T06:30:00.000Z')
  })

  it('respecte les jours choisis (jeudi 17 septembre 2026 : prochain lundi)', () => {
    const from = new Date('2026-09-17T12:00:00Z')
    const next = nextRun({ timeLocal: '21:00', timezone: 'Europe/Paris', days: [1] }, from)
    expect(next.toISOString()).toBe('2026-09-21T19:00:00.000Z')
    expect(localParts(next, 'Europe/Paris').weekday).toBe(1)
  })

  it('traverse le changement d heure sans décaler l heure locale', () => {
    // Nuit du 24 au 25 octobre 2026 : retour à l'heure d'hiver à Paris.
    const from = new Date('2026-10-24T10:00:00Z')
    const next = nextRun({ timeLocal: '08:00', timezone: 'Europe/Paris', days: null }, from)
    expect(next.toISOString()).toBe('2026-10-25T07:00:00.000Z')
    expect(localParts(next, 'Europe/Paris').hour).toBe(8)
  })

  it('fonctionne dans un fuseau à l ouest', () => {
    const from = new Date('2026-09-17T03:00:00Z') // 23 h la veille à New York
    expect(nextRun({ timeLocal: '07:00', timezone: 'America/New_York', days: null }, from).toISOString()).toBe('2026-09-17T11:00:00.000Z')
  })

  it('valide les fuseaux', () => {
    expect(isValidTimezone('Europe/Paris')).toBe(true)
    expect(isValidTimezone('Mars/Olympus')).toBe(false)
  })

  it('refuse une heure mal formée', () => {
    expect(() => nextRun({ timeLocal: '25:00', timezone: 'Europe/Paris', days: null }, new Date())).toThrow()
  })
})

describe('icône de la notification', () => {
  it('porte celle de l IA qui parle, pas celle de Flowear', () => {
    const checkin = { id: 'c1', userId: 'u', appSlug: 'amorce', kind: 'daily', timeLocal: '21:00', timezone: 'Europe/Paris', days: null, message: 'Prépare demain', prompt: 'x', nextRunAt: '2026-09-18T19:00:00Z', active: true, lastSentAt: null, createdAt: '', updatedAt: '' } as Parameters<typeof buildCheckinPayload>[0]
    const payload = buildCheckinPayload(checkin, 'Amorce')
    expect(payload.icon).toBe('/pwa-icons/amorce-192.png')
    expect(JSON.parse(serializePayload(payload)).icon).toBe('/pwa-icons/amorce-192.png')
  })
})
