import { generateText } from 'ai'
import { generateWithFallback } from '@/core/agent/fallback'
import type { ModelCandidate } from '@/core/agent/models'
import type { Note } from '@/core/data/types'
import { DEFAULT_LOCALE, LOCALE_META, isLocale } from '@/core/i18n/locale'

/**
 * Mémoire automatique : après chaque échange, un petit modèle extrait les faits durables
 * que la personne a révélés (situation, préférence, décision, contrainte, ce qu'elle a
 * déjà essayé). Zéro fait la plupart du temps ; jamais plus de trois.
 * Le résultat est dédoublonné contre les notes existantes avant d'être enregistré.
 */
export interface MemoryUpdate {
  add: string[]
  /** Indices (1-based) des souvenirs existants devenus faux ou remplacés. */
  forget: number[]
}

function cleanFacts(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return list
    .filter((f): f is string => typeof f === 'string')
    .map((f) => f.trim().replace(/\s+/g, ' '))
    .filter((f) => f.length >= 8 && f.length <= 300)
    .slice(0, 3)
}

/** Accepte `{"add":[...],"forget":[...]}` ou, par tolérance, un simple tableau de faits. */
export function parseMemoryUpdate(raw: string): MemoryUpdate {
  const text = raw.trim()
  const objStart = text.indexOf('{')
  const arrStart = text.indexOf('[')
  try {
    if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
      const end = text.lastIndexOf('}')
      const parsed = JSON.parse(text.slice(objStart, end + 1)) as { add?: unknown; forget?: unknown }
      const forget = Array.isArray(parsed.forget)
        ? parsed.forget.filter((n): n is number => Number.isInteger(n) && n >= 1).slice(0, 5)
        : []
      return { add: cleanFacts(parsed.add), forget }
    }
    if (arrStart >= 0) {
      const end = text.lastIndexOf(']')
      return { add: cleanFacts(JSON.parse(text.slice(arrStart, end + 1))), forget: [] }
    }
  } catch {
    /* réponse inexploitable : rien à retenir */
  }
  return { add: [], forget: [] }
}

/** Compatibilité : uniquement les ajouts. */
export function parseMemoryFacts(raw: string): string[] {
  return parseMemoryUpdate(raw).add
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Écarte un fait déjà connu (même contenu, ou contenu inclus dans une note existante). */
export function dedupeFacts(facts: readonly string[], existing: readonly Note[]): string[] {
  const known = existing.map((n) => normalize(n.content))
  const out: string[] = []
  for (const f of facts) {
    const nf = normalize(f)
    if (!nf) continue
    if (known.some((k) => k.includes(nf) || nf.includes(k))) continue
    if (out.some((o) => normalize(o) === nf)) continue
    out.push(f)
  }
  return out
}

export async function extractMemories(input: {
  candidates: readonly ModelCandidate[]
  userText: string
  answerText: string
  existing: readonly Note[]
  locale: string
}): Promise<{ add: string[]; forgetIds: string[] }> {
  if (input.candidates.length === 0) return { add: [], forgetIds: [] }
  const existing = input.existing.slice(0, 40)
  const numbered = existing.map((n, i) => `${i + 1}. ${n.content}`).join('\n') || '(aucun)'
  const language = LOCALE_META[isLocale(input.locale) ? input.locale : DEFAULT_LOCALE].french
  try {
    const { result } = await generateWithFallback({
      candidates: input.candidates,
      run: (c) =>
        generateText({
          model: c.model,
          system: `Tu tiens la mémoire durable d'un assistant personnel.
À partir de l'échange, tu produis deux choses :
- "add" : les faits nouveaux et durables que la PERSONNE révèle sur elle-même (situation, préférence, contrainte, objectif, décision, ce qu'elle a déjà essayé). 0 à 3 éléments, à la troisième personne, en ${language}. Ignore les demandes ponctuelles, les politesses et ce que l'assistant a dit.
- "forget" : les numéros des souvenirs existants que ce nouvel échange rend faux ou remplace (par exemple un horaire, un lieu, un objectif qui change). Vide si rien ne change.
Réponds UNIQUEMENT par un objet JSON : {"add": [...], "forget": [...]}. Exemple : {"add": ["Se lève à 8h"], "forget": [2]}.`,
          prompt: `Souvenirs existants :\n${numbered}\n\nMessage de la personne :\n${input.userText.slice(0, 2000)}\n\nRéponse de l'assistant (contexte seulement) :\n${input.answerText.slice(0, 1200)}`,
          maxOutputTokens: 300,
          temperature: 0,
          abortSignal: AbortSignal.timeout(10_000),
        }),
    })
    const update = parseMemoryUpdate(result.text)
    const forgetIds = update.forget.map((n) => existing[n - 1]?.id).filter((id): id is string => Boolean(id))
    const kept = existing.filter((n) => !forgetIds.includes(n.id))
    return { add: dedupeFacts(update.add, kept), forgetIds }
  } catch {
    return { add: [], forgetIds: [] }
  }
}
