import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getServerEnv } from '@/lib/env'

/** Jeton de désinscription : HMAC de l'identifiant, signé par CRON_SECRET. Pas de session requise pour cliquer. */
export function unsubscribeToken(userId: string): string {
  const secret = getServerEnv().CRON_SECRET ?? ''
  return createHmac('sha256', secret).update(`digest:${userId}`).digest('hex')
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = unsubscribeToken(userId)
  if (expected.length !== token.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token))
}
