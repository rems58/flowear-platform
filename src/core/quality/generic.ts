/**
 * Détection heuristique d'une réponse générique (idée n° 4 du registre).
 * Une réponse est jugée personnalisée si elle cite au moins une valeur du profil
 * ou si un outil a été appelé (la réponse s'appuie alors sur une donnée réelle).
 * Retourne null quand on ne peut pas juger (profil vide).
 */
export function isGenericAnswer(input: {
  text: string
  profile: Record<string, unknown>
  toolCalled: boolean
}): boolean | null {
  if (input.toolCalled) return false
  const values = Object.values(input.profile)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v).trim().toLowerCase())
    .filter((v) => v.length >= 3)
  if (values.length === 0) return null
  const text = input.text.toLowerCase()
  const cited = values.some((v) => text.includes(v))
  return !cited
}
