import 'server-only'
import { DraftError } from '@/core/studio/draft'
import { isCreator } from '@/lib/access'
import { AppError } from './errors'
import { requireUser } from './guard'

/** Connecté et créateur (ou administrateur), sinon 403. */
export async function requireCreator(): Promise<string> {
  const userId = await requireUser()
  if (!(await isCreator(userId))) throw AppError.forbidden('Espace créateur requis')
  return userId
}

/** Traduit une erreur de brouillon en réponse : un `code` stable, le client affiche dans sa langue. */
export function draftErrorToResponse(error: unknown): never {
  if (error instanceof DraftError) {
    if (error.code === 'not_found') throw AppError.notFound('IA introuvable')
    throw new AppError(error.code, 400, 'Brouillon refusé', error.results ? { results: error.results } : undefined)
  }
  throw error
}
