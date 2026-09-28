import type { AppDefinition } from '@/apps/types'
import { pendingAssessmentFor } from '@/core/assessments/engine'
import { pick } from '@/core/i18n/locale'
import { SUPPORTED_LOCALES } from '@/core/i18n/locale'
import type { Messages } from '@/lib/i18n/messages'

/**
 * Messages qui viennent d'un bouton de carte, pas de la personne qui écrit. Deux cas :
 * la question d'un questionnaire (l'outil `assessment` est imposé : le modèle ne doit ni
 * conclure ni sauter une question) ; la carte d'une tâche (« Fait : … »), où la carte a
 * déjà mis la tâche à jour elle-même, donc rien n'est imposé, le modèle enchaîne.
 * Imposer un outil que le modèle ne veut pas appeler fait échouer l'étape chez Groq :
 * on ne l'impose que quand l'appel est la seule suite possible.
 */
export interface ForcedToolInput {
  app: AppDefinition
  profile: Record<string, unknown>
  userText: string
  toolNames: readonly string[]
  messages: (locale: (typeof SUPPORTED_LOCALES)[number]) => Messages
}

/** Le message vient d'une carte de tâche (« Fait : … », dans n'importe quelle langue). */
export function isTaskCardMessage(userText: string, messages: ForcedToolInput['messages']): boolean {
  const text = userText.trim().toLowerCase()
  for (const locale of SUPPORTED_LOCALES) {
    const t = messages(locale).tasks
    for (const template of [t.donePrompt, t.laterPrompt, t.dropPrompt]) {
      const prefix = template.split('{title}')[0].trim().toLowerCase()
      if (prefix && text.startsWith(prefix)) return true
    }
  }
  return false
}

/** Le message vient du bouton « Refaire le test » d'une carte de résultat : l'identifiant du questionnaire, sinon null. */
export function restartAssessmentFor(app: AppDefinition, userText: string, messages: ForcedToolInput['messages']): string | null {
  const text = userText.trim().toLowerCase()
  for (const locale of SUPPORTED_LOCALES) {
    const prefix = messages(locale).assessment.restartPrompt.split('{name}')[0].trim().toLowerCase()
    if (!prefix || !text.startsWith(prefix)) continue
    const name = text.slice(prefix.length).trim()
    const def = app.assessments.find((a) => SUPPORTED_LOCALES.some((l) => pick(a.name, l).trim().toLowerCase() === name))
    if (def) return def.id
  }
  return null
}

/** L'énergie du moment est encore valable pendant une heure. */
export const ENERGY_FRESH_MS = 60 * 60_000
export const ENERGY_KEY = 'energy_now'

export interface ForcedToolContext extends ForcedToolInput {
  now: Date
  /** Des tâches restent : après une tâche faite, on enchaîne ; sinon rien à imposer. */
  openTasks: number
}

export function isEnergyFresh(profile: Record<string, unknown>, now: Date): boolean {
  const at = profile[`_${ENERGY_KEY}_at`]
  return typeof at === 'string' && now.getTime() - new Date(at).getTime() < ENERGY_FRESH_MS
}

/** Le message est une réponse à la question d'énergie (« À plat », « Moyen », « En forme », dans n'importe quelle langue). */
export function isEnergyAnswer(userText: string, messages: ForcedToolInput['messages']): boolean {
  const text = userText.trim().toLowerCase()
  return SUPPORTED_LOCALES.some((locale) => messages(locale).tasks.energyChoices.some((c) => c.toLowerCase() === text))
}

/** Niveau d'énergie à partir d'un libellé (« Moyen », « High »…), dans n'importe quelle langue. */
export function energyFromLabel(label: unknown, messages: ForcedToolInput['messages']): 'low' | 'mid' | 'high' | null {
  if (typeof label !== 'string') return null
  const text = label.trim().toLowerCase()
  for (const locale of SUPPORTED_LOCALES) {
    const i = messages(locale).tasks.energyChoices.findIndex((c) => c.toLowerCase() === text)
    if (i >= 0) return (['low', 'mid', 'high'] as const)[i]
  }
  return null
}

/**
 * Entrée de l'outil imposé, calculée par le code : l'outil est alors exécuté directement,
 * sans passer par le modèle. Un modèle à qui l'on impose un appel écrit parfois le nom de
 * l'outil en texte et le fournisseur renvoie une erreur ; quand le produit connaît la suite,
 * il n'a pas à la lui demander.
 */
export function directToolInput(tool: string, input: ForcedToolContext & { locale: (typeof SUPPORTED_LOCALES)[number] }): Record<string, unknown> | null {
  const { app, profile, userText, messages, locale } = input
  if (tool === 'next_action') {
    return { energy: energyFromLabel(userText, messages) ?? energyFromLabel(profile[ENERGY_KEY], messages) ?? 'mid' }
  }
  if (tool === 'ask_choice') {
    const t = messages(locale).tasks
    return { question: t.energyQuestion, options: [...t.energyChoices] }
  }
  if (tool === 'assessment') {
    const restart = restartAssessmentFor(app, userText, messages)
    if (restart) return { assessmentId: restart, restart: true }
    const id = pendingAssessmentFor(app.assessments, profile, userText)
    return id ? { assessmentId: id } : null
  }
  return null
}

export function forcedToolFor(input: ForcedToolContext): string | null {
  const { app, profile, userText, toolNames, now, openTasks } = input
  if (toolNames.includes('assessment') && (pendingAssessmentFor(app.assessments, profile, userText) || restartAssessmentFor(app, userText, input.messages))) return 'assessment'
  if (!app.tasks.enabled || openTasks === 0) return null
  // Réponse à la question d'énergie (la carte a déjà rangé l'énergie dans le profil) : la seule
  // suite est une tâche. Le modèle écrivait parfois « --- next_action --- » au lieu de l'appeler.
  if (isEnergyAnswer(userText, input.messages) && toolNames.includes('next_action')) return 'next_action'
  // Message d'une carte de tâche (la carte a déjà mis la tâche à jour) : la suite est une
  // seule tâche adaptée à l'énergie. Énergie fraîche = next_action, sinon on la redemande.
  if (isTaskCardMessage(userText, input.messages)) {
    if (isEnergyFresh(profile, now) && toolNames.includes('next_action')) return 'next_action'
    if (toolNames.includes('ask_choice')) return 'ask_choice'
  }
  return null
}

/**
 * Messages qui appellent une réponse en mots, jamais un outil : une excuse, un retour après
 * absence, un « je suis nul ». Le modèle, à qui l'on a dit de proposer « une petite chose »,
 * sort une carte de tâche à quelqu'un qui revient avec de la honte. Sur ces messages courts et
 * sans demande, le premier pas se fait sans outil ; la carte viendra au message suivant si la
 * personne le demande.
 */
// Les lettres accentuées ne sont pas des « mots » pour \b : on borne par des lookarounds Unicode.
const W = (alternatives: string) => new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, 'iu')
const TEXT_ONLY_PATTERNS: RegExp[] = [
  W("d[ée]sol[ée]e?|pardon|excuse[- ]moi|j'?ai (?:tout )?l[âa]ch[ée]|j'?ai (?:tout )?abandonn[ée]|je suis nul(?:le)?|journ[ée]e (?:perdue|foutue)|j'?ai rien fait"),
  W("sorry|my bad|i (?:gave up|dropped everything|quit everything)|i'?m useless|wasted day|i did nothing"),
  W("lo siento|perd[óo]n|disculpa|lo dej[ée] todo|abandon[ée] todo|soy un desastre|no hice nada"),
  W("entschuldigung|tut mir leid|hab(?:e)? alles (?:aufgegeben|liegen ?lassen)|ich bin nutzlos|nichts gemacht"),
  W("scusa|mi dispiace|ho mollato(?: tutto)?|ho lasciato tutto|sono un disastro|non ho fatto niente"),
]
/** Un message bref, sans demande explicite (pas de « ? », pas de liste), qui s'excuse ou se dévalorise. */
export function isTextOnlyMessage(userText: string): boolean {
  const text = userText.trim()
  if (text.length > 220 || text.includes('?') || /[,;\n]/.test(text) && text.split(/[,;\n]/).length > 2) return false
  return TEXT_ONLY_PATTERNS.some((re) => re.test(text))
}
