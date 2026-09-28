import 'server-only'
import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { getRateLimiter } from '@/lib/api/rate-limit'
import { getRepo } from '@/lib/db/repo'
import { getServerEnv } from '@/lib/env'

export const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'ref'] as const

/** Les paramètres `utm_*` d'une adresse, bornés, ou `null` s'il n'y en a aucun. */
export function readUtm(params: Record<string, string | string[] | undefined>): Record<string, string> | null {
  const out: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const raw = key === 'ref' ? (params.ref ?? params.utm_ref) : params[`utm_${key}`]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 80)
  }
  if (out.ref && !out.source) out.source = 'creator'
  return Object.keys(out).length ? out : null
}

/**
 * Enregistre une visite anonyme du hub. Jamais bloquant, jamais d'adresse en clair :
 * l'empreinte est un condensé de l'adresse, du navigateur et du jour, salé par la clé
 * service de la base. Qui possède cette clé lit déjà la table, donc le sel n'ajoute pas de
 * porte ; sans elle, l'espace des adresses est trop grand pour être parcouru. L'empreinte
 * change chaque jour : impossible de suivre quelqu'un d'un jour à l'autre.
 *
 * Page publique, donc bornée : quelques écritures par adresse et par minute, pas plus,
 * pour qu'un script ne remplisse pas la table en variant le navigateur annoncé.
 */
export async function recordVisit(path: string, utm: Record<string, string> | null): Promise<void> {
  try {
    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || ''
    // Sans adresse, pas d'empreinte fiable : on ne compte pas plutôt que de compter faux.
    if (!ip) return
    const agent = (h.get('user-agent') ?? '').slice(0, 200)
    // Les robots déclarés ne sont pas des visites.
    if (/bot|crawl|spider|preview|vercel-screenshot/i.test(agent)) return
    const allowed = await getRateLimiter().limit(`visit:${ip}`, 5, 60_000)
    if (!allowed.allowed) return
    const day = new Date().toISOString().slice(0, 10)
    const salt = getServerEnv().SUPABASE_SERVICE_ROLE_KEY
    const visitorHash = createHash('sha256').update(`${salt}|${day}|${ip}|${agent}`).digest('hex').slice(0, 32)
    await getRepo().visits.record({ day, path: path.slice(0, 200), utm, visitorHash })
  } catch (error) {
    console.error('[visit]', error instanceof Error ? error.message : error)
  }
}
