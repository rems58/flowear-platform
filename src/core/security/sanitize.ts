/**
 * Nettoyage des entrées texte. On ne « répare » pas, on borne :
 * caractères de contrôle retirés, espaces normalisés, longueur plafonnée.
 * Le rendu Markdown côté client n'interprète jamais de HTML brut.
 */
// Caractères de contrôle C0 (sauf tabulation et saut de ligne) et DEL.
const CONTROL_CHARS = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', 'g')

export function sanitizeText(input: unknown, maxChars: number): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(CONTROL_CHARS, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxChars)
}

export const SLUG_RE = /^[a-z0-9-]{2,32}$/

export function isSafeSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_RE.test(value)
}

/** Identifiants de messages côté client : alphanumériques, tirets, 4 à 64 caractères. */
export const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{4,64}$/

export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && MESSAGE_ID_RE.test(value)
}
