/**
 * En-têtes d'un manifeste.
 *
 * Le manifeste est demandé avec les cookies (voir `ManifestLink`), donc sa réponse dépend
 * de la personne : elle porte la langue choisie. Elle ne doit jamais être mise en commun
 * dans un cache partagé, sinon la première visite fixerait la langue de tout le monde.
 * C'est exactement ce qui est arrivé le 16 septembre 2026 : le manifeste répondait en
 * français à un navigateur allemand.
 */
export const MANIFEST_HEADERS = {
  'content-type': 'application/manifest+json; charset=utf-8',
  'cache-control': 'private, no-cache, must-revalidate',
  vary: 'Accept-Language, Cookie',
} as const
