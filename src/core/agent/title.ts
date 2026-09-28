import { generateText } from 'ai'
import { DEFAULT_LOCALE, LOCALE_META, isLocale, type Locale } from '@/core/i18n/locale'
import { generateWithFallback } from './fallback'
import type { ModelCandidate } from './models'

/** Titre provisoire d'une conversation, remplacé dès que le petit modèle en propose un. */
export const DEFAULT_TITLES: Record<Locale, string> = {
  en: 'New conversation',
  fr: 'Nouvelle conversation',
  es: 'Nueva conversación',
  de: 'Neue Unterhaltung',
  it: 'Nuova conversazione',
}
export function defaultTitle(locale: string): string {
  return DEFAULT_TITLES[isLocale(locale) ? locale : DEFAULT_LOCALE]
}

/** Titre de conversation depuis le premier message : petit modèle, borné, jamais bloquant. */
function truncateAtWord(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trim()
}

export async function generateTitle(candidates: readonly ModelCandidate[], firstMessage: string, locale: string): Promise<string> {
  const fallback = truncateAtWord(firstMessage, 60) || defaultTitle(locale)
  if (candidates.length === 0) return fallback
  const language = LOCALE_META[isLocale(locale) ? locale : DEFAULT_LOCALE].french
  try {
    const { result } = await generateWithFallback({
      candidates,
      run: (c) =>
        generateText({
          model: c.model,
          system: `Donne un titre de 3 à 6 mots, dans la langue du message (sinon en ${language}), sans guillemets ni ponctuation finale, pour la conversation qui commence par le message ci-dessous. Réponds uniquement le titre.`,
          prompt: firstMessage.slice(0, 600),
          // Les modèles qui raisonnent consomment des tokens avant le texte : marge large, sortie ensuite bornée.
          maxOutputTokens: 256,
          temperature: 0.2,
          abortSignal: AbortSignal.timeout(8000),
        }),
    })
    const title = truncateAtWord(result.text.replace(/["«»\n]/g, ''), 60)
    return title || fallback
  } catch {
    return fallback
  }
}
