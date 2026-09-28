/**
 * Lien de statistiques partagé avec un créateur : un jeton aléatoire de 256 bits dans l'URL,
 * dont seule l'empreinte SHA-256 est gardée en base. Une fuite de la base ne donne aucun lien
 * valide ; régénérer ou révoquer le jeton tue l'ancien lien sur-le-champ.
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isShareTokenFormat(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
