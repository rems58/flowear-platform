/**
 * Slug réservé aux notifications de l'admin. Aucune IA ne porte ce nom : le registre
 * (`src/apps/registry.ts`) lève au démarrage si un manifeste le prend, et `getAppOr404`
 * ne le connaît pas, donc aucune route publique ne peut y écrire. Seule `/api/admin/push`
 * y abonne un navigateur, et seuls les administrateurs du moment sont servis.
 */
export const ADMIN_PUSH_SLUG = 'flowear-admin'
