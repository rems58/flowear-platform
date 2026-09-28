import 'server-only'
import { getServerEnv } from '@/lib/env'

/** Envoi d'email via l'API Resend, sans SDK. Absent de la config = aucun envoi, jamais d'erreur. */
export async function sendEmail(input: { to: string; subject: string; text: string; html: string }): Promise<'sent' | 'skipped'> {
  const env = getServerEnv()
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return 'skipped'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}`)
  return 'sent'
}
