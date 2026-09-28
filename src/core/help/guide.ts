import type { AppDefinition } from '@/apps/types'
import { pick, type Locale } from '@/core/i18n/locale'
import { resolveConfig } from '@/core/config/resolve'
import { ensureToolsRegistered, getTool, resolveTools } from '@/core/tools'
import { ALWAYS_ON_TOOLS } from '@/core/tools/registry'
import { getMessages, type Messages } from '@/lib/i18n/messages'

export interface GuideEntry {
  key: string
  title: string
  text: string
  /** Message prêt à envoyer ; absent pour ce que l'IA fait toute seule. */
  example?: string
}

export interface Guide {
  intro: string
  /** À dire dans la conversation (un exemple à toucher). */
  say: GuideEntry[]
  /** Ce que l'IA fait sans qu'on le demande. */
  auto: GuideEntry[]
  /** Toujours là : mémoire, dictée, notifications, avis, langues. */
  always: GuideEntry[]
}

interface ToolHelp {
  title: string
  text: string
  example?: string
}

/**
 * Le guide d'une IA, déduit de son manifeste : ses outils activés (chacun a sa description
 * dans le dictionnaire, cinq langues), ses questionnaires, et ce que toute IA a. Une IA nouvelle
 * a son guide sans rien écrire ; un outil nouveau doit avoir sa description (le test l'exige),
 * sinon il n'existe pas pour la personne.
 */
export function buildGuide(app: AppDefinition, locale: Locale): Guide {
  ensureToolsRegistered()
  const t: Messages = getMessages(locale)
  const name = pick(app.name, locale)
  const say: GuideEntry[] = []
  const auto: GuideEntry[] = []
  const descriptions = t.help.tools as Record<string, ToolHelp | undefined>

  const names = [...app.tools.enabled, ...ALWAYS_ON_TOOLS.filter((n) => !app.tools.enabled.includes(n))]
  // L'ordre du manifeste est l'ordre d'importance voulu par l'IA.
  for (const toolName of names) {
    if (!getTool(toolName)) continue
    const d = descriptions[toolName]
    if (!d) continue
    if (toolName === 'assessment') {
      // Un exemple par questionnaire, avec son nom.
      for (const def of app.assessments) {
        say.push({ key: `assessment:${def.id}`, title: pick(def.name, locale), text: d.text, example: d.example ?? pick(def.name, locale) })
      }
      continue
    }
    const entry: GuideEntry = { key: toolName, title: d.title, text: d.text, ...(d.example ? { example: d.example } : {}) }
    ;(d.example ? say : auto).push(entry)
  }
  const always: GuideEntry[] = Object.entries(t.help.features).map(([key, f]) => ({ key, title: f.title, text: f.text }))
  return { intro: t.help.intro.replace('{name}', name), say, auto, always }
}

/** Réservé aux tests : les outils de cette IA sans description dans le dictionnaire de référence. */
export function undocumentedTools(app: AppDefinition): string[] {
  ensureToolsRegistered()
  const known = getMessages('en').help.tools as Record<string, unknown>
  return resolveTools(resolveConfig(app, []), 'paid')
    .map((d) => d.name)
    .filter((n) => !(n in known))
}
