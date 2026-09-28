import { appBrand, resolveQuestion, type AppDefinition, type Brand, type CategoryId, type PublicOnboardingQuestion } from '@/apps/types'
import { pick, type Locale } from '@/core/i18n/locale'
import { ensureToolsRegistered, getTool, PANEL_RENDERS, type PanelRender } from '@/core/tools'
import { getMessages } from '@/lib/i18n/messages'

/**
 * Vue publique d'un manifeste, résolue dans une langue : ce que le navigateur a le droit de voir.
 * La persona et le system prompt n'en font jamais partie. Tous les textes sont déjà traduits.
 */
export interface PublicApp {
  slug: string
  name: string
  tagline: string
  description?: string
  access: 'public' | 'private'
  category: CategoryId
  brand: Brand
  onboarding: { intro?: string; questions: PublicOnboardingQuestion[] }
  pwa: { shortName: string; themeColor: string; backgroundColor: string }
  /** Types de productions que les tools activés savent créer : un panneau par type. */
  panels: { type: PanelRender; label: string }[]
  /** Suggestions cliquables du manifeste, déjà traduites. */
  suggestions: { label: string; prompt: string }[]
}

export function toPublicApp(app: AppDefinition, locale: Locale): PublicApp {
  const name = pick(app.name, locale)
  return {
    slug: app.slug,
    name,
    tagline: pick(app.tagline, locale),
    description: app.description === undefined ? undefined : pick(app.description, locale),
    access: app.access,
    category: app.category,
    brand: appBrand(app, locale),
    onboarding: {
      intro: app.onboarding.intro === undefined ? undefined : pick(app.onboarding.intro, locale),
      questions: app.onboarding.questions.map((q) => resolveQuestion(q, locale)),
    },
    pwa: { ...app.pwa },
    panels: panelsFor(app, locale),
    suggestions: app.suggestions.map((s) => ({ label: pick(s.label, locale), prompt: pick(s.prompt, locale) })),
  }
}

function panelsFor(app: AppDefinition, locale: Locale): PublicApp['panels'] {
  ensureToolsRegistered()
  const labels = getMessages(locale).panels
  const types = new Set<PanelRender>()
  // Le panneau des tâches vient de `tasks.enabled`, pas d'un outil : une IA qui gère des tâches
  // sans avoir d'outil de vidage (propre à Amorce) doit quand même les montrer.
  if (app.tasks.enabled) types.add('tasks')
  for (const name of app.tools.enabled) {
    const render = getTool(name)?.render
    if (render && (PANEL_RENDERS as readonly string[]).includes(render)) types.add(render as PanelRender)
  }
  // Le guide ferme toujours la liste : toute IA a le sien.
  types.add('help')
  return Array.from(types).map((type) => ({ type, label: labels[type] }))
}
