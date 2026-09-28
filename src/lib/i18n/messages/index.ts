import type { Locale } from '@/core/i18n/locale'
import { de } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'
import { it } from './it'
import type { Messages } from './types'

export type { Messages }

export const MESSAGES: Record<Locale, Messages> = { en, fr, es, de, it }

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale] ?? en
}

/** Remplace {name} par sa valeur. Une variable absente reste visible : plus facile à repérer qu'un vide. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}

/** Message d'erreur API traduit depuis son code, sinon le message brut du serveur, sinon un générique. */
export function errorMessage(messages: Messages, code: string | undefined, fallback?: string | null): string {
  const known = code ? (messages.errors as Record<string, string>)[code] : undefined
  return known ?? fallback ?? messages.common.error
}
