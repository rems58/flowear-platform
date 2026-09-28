import { z } from 'zod'
import { SUPPORTED_LOCALES } from '@/core/i18n/locale'
import { getMessages } from '@/lib/i18n/messages'
import { ENERGY_KEY } from '@/core/agent/forced-tool'
import { defineTool } from '../define'

export const CHOICE_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/

const askChoiceInput = z.object({
  question: z.string().min(3).max(200).describe('La question, courte, dans la langue de la personne'),
  // Des libellés en texte brut, pas des objets : les modèles ouverts corrompent les tableaux
  // d'objets (« "label":"label":"Moyen" »). La valeur envoyée est le libellé lui-même.
  options: z.array(z.string().min(1).max(80)).min(2).max(4).describe('Deux à quatre choix, en texte brut (ex. « À plat »). Un cinquième « autre » avec saisie libre est toujours ajouté'),
  saveAs: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('profile'), key: z.string().regex(CHOICE_KEY_RE).describe('Clé du profil où ranger la réponse') }),
      z.object({ kind: z.literal('note') }),
      z.object({ kind: z.literal('none') }),
    ])
    .default({ kind: 'none' })
    .describe('Où garder la réponse : dans le profil (durable), en note, ou nulle part (question de l’instant)'),
})

/** Les trois choix d'énergie d'une langue, dans n'importe quel ordre, à la casse près. */
export function isEnergyQuestion(labels: readonly string[]): boolean {
  const set = new Set(labels.map((l) => l.trim().toLowerCase()))
  return SUPPORTED_LOCALES.some((locale) => {
    const canon = getMessages(locale).tasks.energyChoices.map((l) => l.toLowerCase())
    return canon.length === set.size && canon.every((l) => set.has(l))
  })
}

export interface AskChoiceData {
  question: string
  options: { value: string; label: string }[]
  saveAs: z.infer<typeof askChoiceInput>['saveAs']
  allowOther: true
}

/**
 * Pose une question à choix, affichée en boutons dans le chat, avec toujours un « autre »
 * en saisie libre. La réponse revient comme un message de la personne, et le client
 * l'enregistre lui-même (route /choice) là où `saveAs` l'indique : l'IA n'a rien à refaire.
 */
export const askChoice = defineTool({
  name: 'ask_choice',
  description:
    'Pose une question à la personne avec 2 à 4 choix cliquables, plus un champ libre « autre ». À utiliser quand une réponse courte suffit et qu’un choix est plus rapide que d’écrire (énergie du moment, temps disponible, préférence). La réponse est enregistrée là où saveAs le dit.',
  input: askChoiceInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'choice',
  endsTurn: true,
  async execute(input): Promise<AskChoiceData> {
    // Le défaut du schéma vaut quand le SDK valide l'entrée ; on le garantit aussi ici.
    const seen = new Set<string>()
    const options = input.options
      .map((label) => label.trim())
      .filter((label) => label && !seen.has(label.toLowerCase()) && seen.add(label.toLowerCase()))
      .map((label) => ({ value: label, label }))
    // La question de l'énergie est reconnue à ses choix : sa réponse va dans le profil
    // (energy_now, avec son heure), que le modèle l'ait demandé ou non. C'est ce qui permet
    // d'enchaîner les tâches sans redemander.
    const saveAs = isEnergyQuestion(options.map((o) => o.label)) ? { kind: 'profile' as const, key: ENERGY_KEY } : (input.saveAs ?? { kind: 'none' as const })
    return { question: input.question, options, saveAs, allowOther: true }
  },
})
