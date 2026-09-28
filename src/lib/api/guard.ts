import 'server-only'
import { auth } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import type { z } from 'zod'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import type { AppDefinition } from '@/apps/types'
import { ChatError } from '@/core/agent/errors'
import { isSafeSlug } from '@/core/security/sanitize'
import { getRepo } from '@/lib/db/repo'
import { canSeePrivate } from '@/lib/access'
import { getAdminIds } from '@/lib/env'
import { AppError } from './errors'
import { getRateLimiter } from './rate-limit'

/** L'identité vient toujours de la session Clerk, jamais du corps de la requête. */
export async function requireUser(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw AppError.unauthorized()
  return userId
}

export function requireAdmin(userId: string): void {
  if (!getAdminIds().has(userId)) throw AppError.forbidden('Accès administrateur requis')
}

export function getAppOr404(slug: string): AppDefinition {
  if (!isSafeSlug(slug)) throw AppError.notFound('IA introuvable')
  const app = getApp(slug)
  if (!app) throw AppError.notFound('IA introuvable')
  return app
}

export function isAdmin(userId: string): boolean {
  return getAdminIds().has(userId)
}

/**
 * Une IA privée répond 404 à tout le monde sauf aux administrateurs et aux testeurs :
 * elle n'existe pas pour les autres. Être testeur ne donne aucun privilège de plan.
 */
export async function requireAppAccess(app: AppDefinition, userId: string): Promise<void> {
  if (app.access === 'private' && !(await canSeePrivate(userId))) throw AppError.notFound('IA introuvable')
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  return ip.slice(0, 64)
}

/** Corps JSON borné en taille puis validé par Zod. Tout le reste est rejeté. */
export async function readJson<T>(req: NextRequest, schema: z.ZodType<T>, maxBytes = 256_000): Promise<T> {
  // Un formulaire HTML cross-site ne peut pas envoyer application/json sans preflight :
  // exiger ce type ferme la porte au CSRF par formulaire, en plus du SameSite du cookie de session.
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) throw AppError.badRequest('Content-Type application/json requis')
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw AppError.tooLarge()
  const raw = await req.text()
  if (raw.length > maxBytes) throw AppError.tooLarge()
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw AppError.badRequest('JSON invalide')
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw AppError.badRequest('Données invalides', {
      issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return parsed.data
}

export async function rateLimitOrThrow(key: string, max: number, windowMs: number, ctx?: { userId?: string; ip?: string; route?: string }): Promise<void> {
  const result = await getRateLimiter().limit(key, max, windowMs)
  if (!result.allowed) {
    void getRepo().audit.log({ userId: ctx?.userId ?? null, action: 'rate_limited', details: { key, route: ctx?.route }, ip: ctx?.ip ?? null }).catch(() => undefined)
    throw AppError.rateLimited(result.resetAt)
  }
}

type Handler<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>

/**
 * Enveloppe commune des routes : traduit AppError et ChatError en réponses JSON,
 * journalise les refus (401, 403, 429) et les erreurs serveur, ne fuit aucun détail interne.
 */
export function withRoute<P = Record<string, string>>(handler: Handler<P>, route: string): Handler<P> {
  return async (req, ctx) => {
    try {
      await ensureAppsLoaded()
      return await handler(req, ctx)
    } catch (error) {
      const appError =
        error instanceof AppError ? error : error instanceof ChatError ? AppError.fromChatError(error) : null
      if (!appError) {
        console.error(`[api] ${route}`, error)
        // Message tronqué : une erreur de fournisseur ou de base peut contenir des valeurs de lignes.
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 200)
        void getRepo().audit.log({ action: 'api_error', details: { route, message }, ip: clientIp(req) }).catch(() => undefined)
        return NextResponse.json(AppError.internal().toJSON(), { status: 500 })
      }
      if ([401, 403, 429].includes(appError.status)) {
        void getRepo().audit.log({ action: `denied_${appError.status}`, details: { route, code: appError.code }, ip: clientIp(req) }).catch(() => undefined)
      }
      return NextResponse.json(appError.toJSON(), { status: appError.status })
    }
  }
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status })
}
