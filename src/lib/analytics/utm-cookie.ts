import 'server-only'
import { cookies } from 'next/headers'
import { z } from 'zod'

const UTM_COOKIE = 'flowear_utm'
const schema = z.partialRecord(z.enum(['source', 'medium', 'campaign', 'content', 'ref']), z.string().max(80))

/** L'origine gardée par `UtmCapture`, validée : un cookie forgé ne passe pas en base. */
export async function readUtmCookie(): Promise<Record<string, string> | null> {
  try {
    const raw = (await cookies()).get(UTM_COOKIE)?.value
    if (!raw) return null
    // `cookies()` a déjà décodé la valeur : un second décodage casserait un « % » légitime.
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success && Object.keys(parsed.data).length ? parsed.data : null
  } catch {
    return null
  }
}
