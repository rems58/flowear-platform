/** Point d'entrée i18n côté lib : les constantes viennent du cœur, le cookie est défini ici. */
export { DEFAULT_LOCALE, LOCALE_META, SUPPORTED_LOCALES, detectLocale, isLocale, pick } from '@/core/i18n/locale'
export type { Locale, LocalizedText } from '@/core/i18n/locale'

/** Cookie posé uniquement quand la personne choisit sa langue (sinon détection à chaque requête). */
export const LOCALE_COOKIE = 'flowear_locale'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
/** En-tête posé par le middleware quand `?lang=` est dans l'adresse : prime sur tout le reste pour cette requête. */
export const LOCALE_HEADER = 'x-flowear-locale'
