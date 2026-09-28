import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'

// Clerk et la base sont simulés : on teste les garde-fous, pas les services.
const authMock = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }))

const auditLog = vi.fn(async () => undefined)
// `users.get` : un testeur coché depuis l'admin, en base plutôt que dans la variable.
vi.mock('@/lib/db/repo', () => ({
  getRepo: () => ({ audit: { log: auditLog }, users: { get: async (id: string) => (id === 'tester_db' ? { tester: true } : null) } }),
}))

vi.mock('@/lib/env', () => ({
  getAdminIds: () => new Set(['admin_1']),
  getTesterIds: () => new Set(['tester_1']),
  canSeePrivateApps: (id?: string | null) => id === 'admin_1' || id === 'tester_1',
  getServerEnv: () => ({ NODE_ENV: 'test' }),
}))

const { AppError } = await import('@/lib/api/errors')
const { ChatError } = await import('@/core/agent/errors')
const { getAppOr404, isAdmin, rateLimitOrThrow, readJson, requireAdmin, requireAppAccess, requireUser, withRoute } = await import('@/lib/api/guard')
const { remyApp } = await import('@/apps/remy/manifest')

function post(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

describe('requireUser / requireAdmin / getAppOr404', () => {
  beforeEach(() => authMock.mockReset())

  it('refuse sans session et renvoie l’id sinon', async () => {
    authMock.mockResolvedValue({ userId: null })
    await expect(requireUser()).rejects.toMatchObject({ status: 401 })
    authMock.mockResolvedValue({ userId: 'user_9' })
    await expect(requireUser()).resolves.toBe('user_9')
  })

  it('n’accepte que les administrateurs listés', () => {
    expect(() => requireAdmin('admin_1')).not.toThrow()
    expect(() => requireAdmin('user_9')).toThrow(AppError)
  })

  it('404 pour un slug inconnu ou mal formé, jamais d’autre info', () => {
    expect(getAppOr404('remy').slug).toBe('remy')
    expect(() => getAppOr404('inconnu')).toThrow(AppError)
    expect(() => getAppOr404('../etc/passwd')).toThrow(AppError)
  })
})

describe('readJson', () => {
  const schema = z.object({ text: z.string().max(5) })

  it('valide et renvoie les données typées', async () => {
    await expect(readJson(post('{"text":"ok"}'), schema)).resolves.toEqual({ text: 'ok' })
  })
  it('refuse un JSON invalide, un schéma non respecté et un corps trop gros', async () => {
    await expect(readJson(post('{oops'), schema)).rejects.toMatchObject({ status: 400 })
    await expect(readJson(post('{"text":"beaucoup trop long"}'), schema)).rejects.toMatchObject({ status: 400 })
    await expect(readJson(post('{"text":"ok"}'), schema, 5)).rejects.toMatchObject({ status: 413 })
    await expect(readJson(post('{"text":"ok"}', { 'content-length': '999999' }), schema, 100)).rejects.toMatchObject({ status: 413 })
  })
  it('exige application/json (ferme le CSRF par formulaire text/plain)', async () => {
    const form = new NextRequest('http://localhost/api/test', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"text":"ok"}' })
    await expect(readJson(form, schema)).rejects.toMatchObject({ status: 400 })
  })
  it('ignore les clés inconnues au lieu de les laisser passer', async () => {
    const out = await readJson(post('{"text":"ok","userId":"pirate"}'), schema)
    expect(out).toEqual({ text: 'ok' })
  })
})

describe('rateLimitOrThrow', () => {
  it('bloque au-delà de la limite et journalise', async () => {
    await rateLimitOrThrow('t:1', 2, 60_000)
    await rateLimitOrThrow('t:1', 2, 60_000)
    await expect(rateLimitOrThrow('t:1', 2, 60_000, { route: 'test' })).rejects.toMatchObject({ status: 429 })
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'rate_limited' }))
  })
})

describe('withRoute', () => {
  const ctx = { params: Promise.resolve({}) }

  it('traduit AppError et ChatError en JSON avec le bon statut', async () => {
    const r1 = await withRoute(async () => {
      throw AppError.forbidden('non')
    }, 'test')(post('{}'), ctx)
    expect(r1.status).toBe(403)
    expect(await r1.json()).toEqual({ error: { code: 'FORBIDDEN', message: 'non' } })

    const r2 = await withRoute(async () => {
      throw new ChatError('quota_exceeded', 429, 'Quota', { limit: 5 })
    }, 'test')(post('{}'), ctx)
    expect(r2.status).toBe(429)
    expect((await r2.json()).error).toMatchObject({ code: 'QUOTA_EXCEEDED', details: { limit: 5 } })
  })

  it('masque les erreurs internes et journalise', async () => {
    const r = await withRoute(async () => {
      throw new Error('secret interne: clé sk_live_123')
    }, 'test')(post('{}'), ctx)
    expect(r.status).toBe(500)
    const body = await r.json()
    expect(JSON.stringify(body)).not.toContain('sk_live')
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'api_error' }))
  })
})

describe('accès aux IA privées', () => {
  it('un testeur voit une IA privée, sans devenir administrateur', async () => {
    expect(remyApp.access).toBe('private')
    // Administrateur : accès et privilèges.
    await expect(requireAppAccess(remyApp, 'admin_1')).resolves.toBeUndefined()
    expect(isAdmin('admin_1')).toBe(true)
    // Testeur par la variable, ou coché depuis l'admin : accès, mais parcours normal.
    await expect(requireAppAccess(remyApp, 'tester_1')).resolves.toBeUndefined()
    await expect(requireAppAccess(remyApp, 'tester_db')).resolves.toBeUndefined()
    expect(isAdmin('tester_1')).toBe(false)
    // Tout le monde d'autre : l'IA n'existe pas.
    await expect(requireAppAccess(remyApp, 'inconnu')).rejects.toThrowError(/introuvable/)
  })
})
