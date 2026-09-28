import 'server-only'
import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { getAdminIds } from '@/lib/env'

/**
 * Accès aux pages de l'admin. Un non-administrateur reçoit une 404, pas une 403 : la
 * page n'existe pas pour lui, il n'a pas à savoir qu'elle existe. Un testeur non plus.
 */
export async function requireAdminPage(): Promise<string> {
  const { userId } = await auth()
  if (!userId || !getAdminIds().has(userId)) notFound()
  return userId
}
