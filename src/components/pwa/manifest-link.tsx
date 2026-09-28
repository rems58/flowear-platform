/**
 * Lien vers le manifeste de la page courante : celui du hub sur le hub, celui de l'IA sur
 * une IA. Il n'est pas posé dans la mise en page racine, sinon toutes les pages
 * annonceraient le manifeste de Flowear et installer Rémy installerait le hub.
 *
 * `crossOrigin="use-credentials"` fait envoyer les cookies avec la requête du manifeste,
 * qui part sans eux par défaut. Sans ça, le serveur ignore la langue choisie et l'application
 * installée s'ouvre en anglais.
 *
 * React 19 remonte les balises `link` dans l'en-tête du document, où qu'elles soient rendues.
 */
export function ManifestLink({ href }: { href: string }) {
  return <link rel="manifest" href={href} crossOrigin="use-credentials" />
}
