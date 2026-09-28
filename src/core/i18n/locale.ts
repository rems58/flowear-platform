import { z } from 'zod'

/**
 * Langues de Flowear et de toutes ses IA. Cinq langues, l'anglais par défaut
 * quand rien ne permet de deviner. Toute nouvelle fonctionnalité doit exister
 * dans les cinq : le test `tests/core/i18n.test.ts` vérifie que chaque
 * dictionnaire a exactement les mêmes clés que l'anglais.
 */
export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'de', 'it'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** Nom de chaque langue dans sa propre langue (sélecteur) et en français (consignes au modèle). */
export const LOCALE_META: Record<Locale, { autonym: string; french: string; english: string; bcp47: string }> = {
  en: { autonym: 'English', french: 'anglais', english: 'English', bcp47: 'en-US' },
  fr: { autonym: 'Français', french: 'français', english: 'French', bcp47: 'fr-FR' },
  es: { autonym: 'Español', french: 'espagnol', english: 'Spanish', bcp47: 'es-ES' },
  de: { autonym: 'Deutsch', french: 'allemand', english: 'German', bcp47: 'de-DE' },
  it: { autonym: 'Italiano', french: 'italien', english: 'Italian', bcp47: 'it-IT' },
}

/** « fr-FR,fr;q=0.9,en;q=0.8 » → « fr ». Rien de reconnu → locale par défaut. */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=')
      const parsed = q ? Number(q) : 1
      return { lang: lang.trim().split('-')[0].toLowerCase(), q: Number.isFinite(parsed) ? parsed : 0 }
    })
    .filter((r) => r.q > 0)
    .sort((a, b) => b.q - a.q)
  for (const { lang } of ranked) if (isLocale(lang)) return lang
  return DEFAULT_LOCALE
}

/**
 * Texte localisable d'un manifeste : une chaîne (même texte partout, ou nom propre)
 * ou un objet avec l'anglais obligatoire et les autres langues en option.
 */
export function localizedText(max: number, min = 1) {
  const s = z.string().min(min).max(max)
  return z.union([s, z.object({ en: s, fr: s.optional(), es: s.optional(), de: s.optional(), it: s.optional() })])
}
export type LocalizedText = string | ({ en: string } & Partial<Record<Locale, string>>)

/** Résout un texte localisable : la langue demandée, sinon l'anglais. */
export function pick(text: LocalizedText, locale: Locale): string {
  if (typeof text === 'string') return text
  return text[locale] ?? text.en
}
