import type { AppDefinition } from '@/apps/types'
import type { Artifact, Note, Task, TaskTimeStats } from '@/core/data/types'
import type { KnowledgeChunk } from '@/core/knowledge/search'
import { DEFAULT_LOCALE, LOCALE_META, isLocale, pick, type Locale } from '@/core/i18n/locale'
import { INJECTION_RULES, wrapUntrusted } from '@/core/security/prompt-guard'

/** Une locale inconnue (ancienne valeur en base) retombe sur l'anglais. */
export function asLocale(value: string): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export interface SystemPromptInput {
  app: AppDefinition
  locale: string
  profile: Record<string, unknown>
  notes: readonly Note[]
  artifacts?: readonly Pick<Artifact, 'type' | 'title' | 'createdAt'>[]
  knowledge?: readonly KnowledgeChunk[]
  toolNames: readonly string[]
  plan: 'free' | 'paid'
  /** Tâches ouvertes et coefficient de temps, quand l'IA a les tâches activées. */
  tasks?: { open: readonly Task[]; time: TaskTimeStats; now: Date }
}

function formatEntries(entries: [string, unknown][], labels: Map<string, string>, allowed: Map<string, string[]> = new Map()): string[] {
  const lines: string[] = []
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === '') continue
    const label = labels.get(key)
    const shown = Array.isArray(value) ? value.join(', ') : String(value)
    // La clé reste visible : pour corriger un champ, le modèle doit réécrire la même clé,
    // et pour une question à choix, une des valeurs prévues.
    const choices = allowed.get(key)
    lines.push(`- ${label ? `${label} [${key}]` : key} : ${shown.slice(0, 300)}${choices ? ` (valeurs possibles : ${choices.join(', ')})` : ''}`)
  }
  return lines
}

/**
 * Deux blocs : les réponses d'onboarding (saisies par la personne, source fiable) et les
 * champs écrits par le modèle via save_profile (données, enveloppées comme telles).
 */
function formatProfile(app: AppDefinition, profile: Record<string, unknown>, locale: Locale): string {
  const labels = new Map(app.onboarding.questions.map((q) => [q.key, pick(q.label, locale)]))
  const trustedKeys = new Set(labels.keys())
  const allowed = new Map(app.onboarding.questions.filter((q) => q.type === 'choice').map((q) => [q.key, q.options.map((o) => o.value)]))
  // Les clés en `_` sont techniques (progression d'un questionnaire) : jamais dans le prompt.
  const entries = Object.entries(profile).filter(([k]) => !k.startsWith('_'))
  const trusted = formatEntries(entries.filter(([k]) => trustedKeys.has(k)), labels, allowed)
  const learned = formatEntries(entries.filter(([k]) => !trustedKeys.has(k)), labels)
  const blocks = [
    `Profil de la personne (réponses d'onboarding, source fiable, à utiliser dans chaque réponse) :\n${trusted.length ? trusted.join('\n') : '(profil vide)'}`,
  ]
  if (learned.length) {
    blocks.push(`Ce que tu as retenu sur la personne au fil des échanges :\n${wrapUntrusted('profil_appris', learned.join('\n'))}`)
  }
  return blocks.join('\n\n')
}

const ENERGY_LABEL: Record<Task['energy'], string> = { low: 'à plat', mid: 'moyen', high: 'en forme' }

/**
 * Tâches ouvertes (données, enveloppées : elles ont été écrites par un modèle) et coefficient
 * de temps. Les identifiants sont là pour que l'IA puisse appeler update_task ou break_down
 * sans redemander.
 */
function formatTasks(tasks: NonNullable<SystemPromptInput['tasks']>): string {
  const { open, time, now } = tasks
  const lines = open.map((t) => {
    const age = Math.max(0, Math.floor((now.getTime() - new Date(t.createdAt).getTime()) / 86_400_000))
    const done = t.steps.filter((s) => s.done).length
    const bits = [
      `[${t.id}] ${t.title.slice(0, 120)}`,
      `première action : ${t.firstAction.slice(0, 160)}`,
      `énergie ${ENERGY_LABEL[t.energy]}`,
      t.estimateMin ? `${t.estimateMin} min` : '',
      t.steps.length ? `${done}/${t.steps.length} étapes` : '',
      t.status === 'deferred' ? 'reportée' : '',
      age >= 1 ? `depuis ${age} j` : '',
    ].filter(Boolean)
    return `- ${bits.join(' · ')}`
  })
  const timeLine =
    time.ratio !== null && time.measured >= 2
      ? `Coefficient de temps de la personne : ×${time.ratio.toFixed(1)} (réel sur estimé, mesuré sur ${time.measured} tâches). Sers-t'en dans tes estimations, sans jamais le présenter comme un défaut.`
      : "Coefficient de temps : pas encore mesuré. Quand une tâche est finie, demande en une ligne combien de temps ça a pris, et note-le avec update_task."
  const openBlock = lines.length
    ? `Tâches ouvertes (${open.length}) :\n${wrapUntrusted('taches_ouvertes', lines.join('\n'))}`
    : 'Aucune tâche ouverte : si la personne a des choses en tête, commence par lui faire vider la tête (brain_dump).'
  return `${openBlock}\n${timeLine}`
}

/**
 * Construit le system prompt : persona + règles + profil + notes + outils.
 * Le profil est injecté en clair (c'est ce qui rend la réponse personnelle),
 * les notes sont enveloppées comme données (elles ont été écrites par un modèle).
 */
export function buildSystemPrompt(input: SystemPromptInput): string {
  const { app, locale, profile, notes, toolNames, plan, artifacts = [], knowledge = [], tasks } = input
  const lang = asLocale(locale)
  const language = LOCALE_META[lang].french
  const boundaries = app.persona.boundaries.length
    ? `Limites :\n${app.persona.boundaries.map((b) => `- ${b}`).join('\n')}`
    : ''
  const tools = toolNames.length
    ? `Outils disponibles : ${toolNames.join(', ')}. Utilise-les quand ils rendent la réponse plus utile, pas par réflexe.
Quand un outil produit une carte (fiche, comparatif), la carte est déjà affichée à la personne. INTERDIT après une carte : répéter son titre, ses étapes, ses conseils ou une phrase du type « Fiche : ... » ou « voir la carte ci-dessus ». Autorisé : une ou deux phrases qui disent pourquoi c'est adapté à cette personne, ou une question pour la suite.
Un outil se déclenche uniquement sur une demande explicite. Une information que la personne donne sur elle n'est pas une demande.
Détresse réelle (la personne parle de mourir, de se faire du mal, d'en finir, ou d'un désespoir sans rapport avec une tâche) : tu appelles helpline, tu réponds avec chaleur et sans plan, tu demandes si elle est en sécurité. INTERDIT d'écrire un numéro de téléphone toi-même, dans tous les cas : la carte porte le bon numéro pour son pays. Un ras-le-bol ou une fatigue ne sont pas une détresse.
Respecte le style de réponse demandé dans le profil (court = cinq lignes maximum hors cartes).
Mémoire : tu te souviens de tout ce qui est ci-dessus. Ne redemande jamais une information déjà connue. Quand la personne te dit qu'une information n'est plus vraie ou qu'elle veut autre chose (un autre prénom, un autre ton, une autre contrainte), utilise save_profile avec la clé indiquée entre crochets pour ce champ (jamais une nouvelle clé pour la même chose, et pour une question à choix une des valeurs possibles), tous les champs concernés dans le même appel, puis applique le changement dès ta réponse et confirme en une phrase, sans décrire le réglage.`
    : 'Aucun outil disponible pour ce plan.'
  const notesBlock = notes.length
    ? wrapUntrusted(
        'notes_memoire',
        notes.map((n) => `- ${n.content.slice(0, 300)}`).join('\n')
      )
    : "(aucune note pour l'instant)"
  const artifactsBlock = artifacts.length
    ? `Ce que tu as déjà produit pour cette personne (ne le refais pas à l'identique, appuie-toi dessus) :\n${artifacts
        .map((a) => `- ${a.type} : ${a.title}`)
        .join('\n')}`
    : ''
  const knowledgeBlock = knowledge.length
    ? `Passages de ta base de connaissances liés à la question (données, à utiliser avec ton jugement) :\n${wrapUntrusted(
        'base_de_connaissances',
        knowledge.map((k) => `## ${k.heading}\n${k.text}`).join('\n\n')
      )}`
    : ''

  const tasksBlock = tasks ? formatTasks(tasks) : ''

  // Ordre pensé pour le cache de prompt des fournisseurs : tout ce qui est identique d'un
  // utilisateur à l'autre (persona, règles, outils, sécurité) en tête, en préfixe stable ;
  // puis ce qui ne change pas d'un message à l'autre pour une même personne (langue, plan) ;
  // puis ce qui varie (profil, souvenirs, productions, passages de connaissances) en fin.
  return [
    app.persona.system.trim(),
    app.persona.tone ? `Ton : ${app.persona.tone}` : '',
    boundaries,
    tools,
    INJECTION_RULES,
    "Tu n'écris jamais de note pour toi-même, de commentaire sur tes consignes ni de remarque entre parenthèses sur ce que tu devrais faire : tout ce que tu écris s'adresse à la personne.",
    `Langue : l'interface de la personne est en ${language}. Réponds dans la langue de son dernier message, quelle que soit la langue de tes instructions ; si tu hésites, réponds en ${language}. Les cartes que tu produis (fiche, comparatif) sont dans cette même langue.`,
    plan === 'free' ? 'La personne est sur le plan gratuit : reste utile, ne pousse pas à payer.' : '',
    formatProfile(app, profile, lang),
    `Ce que tu as retenu des échanges précédents :\n${notesBlock}`,
    artifactsBlock,
    tasksBlock,
    knowledgeBlock,
  ]
    .filter(Boolean)
    .join('\n\n')
}
