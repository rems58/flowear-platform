import { z } from 'zod'
import { PLAN_IDS } from '@/core/config/defaults'
import { planConfigSchema, toolOverrideSchema } from '@/core/config/schema'
import { SUPPORTED_LOCALES, localizedText, pick, type Locale } from '@/core/i18n/locale'

/**
 * Manifeste d'une IA. Une IA = un fichier `src/apps/<slug>/manifest.ts`.
 * Tout ce qui différencie une IA d'une autre est ici, et nulle part ailleurs.
 * Le manifeste est du JSON typé : l'admin pourra le lire, le schéma de profil
 * se dérive des questions d'onboarding (voir `buildProfileSchema`).
 * Tout texte vu par la personne (nom, accroche, questions, options) est un
 * `localizedText` : une chaîne identique partout, ou un objet par langue avec
 * l'anglais obligatoire. `resolveQuestion` et `toPublicApp` le résolvent.
 */
export const onboardingQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),
    label: localizedText(160),
    placeholder: localizedText(120).optional(),
    required: z.boolean().default(true),
    maxLength: z.number().int().min(1).max(500).default(120),
  }),
  z.object({
    type: z.literal('choice'),
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),
    label: localizedText(160),
    options: z.array(z.object({ value: z.string().min(1).max(40), label: localizedText(80) })).min(2).max(12),
    required: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('multi'),
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),
    label: localizedText(160),
    options: z.array(z.object({ value: z.string().min(1).max(40), label: localizedText(80) })).min(2).max(20),
    required: z.boolean().default(false),
    max: z.number().int().min(1).max(20).default(5),
  }),
  z.object({
    type: z.literal('number'),
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),
    label: localizedText(160),
    min: z.number().default(0),
    max: z.number().default(1_000_000),
    required: z.boolean().default(true),
  }),
])

export type OnboardingQuestion = z.infer<typeof onboardingQuestionSchema>

/** Catégories du hub (libellés dans les dictionnaires, clé `categories.<id>`). */
export const CATEGORY_IDS = ['assistant', 'beauty', 'health', 'productivity', 'finance', 'learning', 'lifestyle'] as const
export type CategoryId = (typeof CATEGORY_IDS)[number]

/** Même forme qu'une question, textes résolus dans une langue : ce que le client reçoit. */
type Resolved<T> = T extends string ? T : T extends { en: string } ? string : T extends (infer U)[] ? Resolved<U>[] : T extends object ? { [K in keyof T]: Resolved<T[K]> } : T
export type PublicOnboardingQuestion = Resolved<OnboardingQuestion>

export function resolveQuestion(q: OnboardingQuestion, locale: Locale): PublicOnboardingQuestion {
  switch (q.type) {
    case 'text':
      return { ...q, label: pick(q.label, locale), placeholder: q.placeholder === undefined ? undefined : pick(q.placeholder, locale) }
    case 'number':
      return { ...q, label: pick(q.label, locale) }
    case 'choice':
    case 'multi':
      return { ...q, label: pick(q.label, locale), options: q.options.map((o) => ({ value: o.value, label: pick(o.label, locale) })) }
  }
}

/**
 * Questionnaire à choix déclaré par une IA (dépistage ASRS pour Amorce, type de peau pour
 * Teinty...). Une question par message, boutons, score par option, niveaux par seuil, résultat
 * enregistré dans le profil sous `profileKey_*`. Le texte du résultat porte lui-même la
 * réserve (dépistage, pas diagnostic) : ce n'est pas au modèle de la formuler.
 */
export const assessmentSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  name: localizedText(80),
  intro: localizedText(400),
  questions: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
        label: localizedText(300),
        options: z
          .array(z.object({ value: z.string().min(1).max(40), label: localizedText(60), score: z.number().int().min(0).max(10), zone: z.boolean().default(false) }))
          .min(2)
          .max(6),
      })
    )
    .min(1)
    .max(30),
  /** Niveaux par nombre de réponses « dans la zone », du plus bas au plus haut (`min` inclus). */
  levels: z.array(z.object({ min: z.number().int().min(0), id: z.string().regex(/^[a-z_]{2,20}$/), label: localizedText(60) })).min(1).max(6),
  /** Texte du résultat, avec {percent}, {level}, {zone}, {total}. */
  result: localizedText(600),
  disclaimer: localizedText(400),
  profileKey: z.string().regex(/^[a-z][a-z0-9_]{0,20}$/),
  /** Instrument dont le questionnaire s'inspire (échelle, auteur). Exigé pour une IA créateur. */
  source: z.string().min(1).max(200).optional(),
  cooldownDays: z.number().int().min(0).max(365).default(90),
})
export type AssessmentDefinition = z.output<typeof assessmentSchema>

/** Logo en image : PNG ou JPEG en base64, rien d'autre (un SVG pourrait porter du script). */
export const BRAND_IMAGE_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/
export const BRAND_IMAGE_MAX = 200_000

export const appManifestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,32}$/),
  name: localizedText(60),
  tagline: localizedText(140),
  /** Accroche de la page tarifs (ce que l'abonnement débloque, dit pour cette IA). Absente : la tagline. */
  pitch: localizedText(140).optional(),
  description: localizedText(600).optional(),
  /** Langues servies. Par défaut les cinq de Flowear : une IA est multilingue d'office. */
  locales: z.array(z.enum(SUPPORTED_LOCALES)).min(1).default([...SUPPORTED_LOCALES]),
  /** Catégorie affichée sur le hub. */
  category: z.enum(CATEGORY_IDS).default('assistant'),
  /** `private` : invisible sur le hub et réservée aux administrateurs (ADMIN_CLERK_USER_IDS). */
  access: z.enum(['public', 'private']).default('public'),
  /** Icône façon app : dégradé et glyphe. */
  brand: z
    .object({
      from: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      to: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      glyph: z.string().min(1).max(2),
      /**
       * Logo dessiné : contenu SVG (traits blancs) dans une grille de 64, sans balise <svg>.
       * Remplace le glyphe partout où l'icône s'affiche. Code du dépôt, jamais une saisie.
       */
      mark: z.string().min(10).max(4000).optional(),
      /**
       * Logo en image, fourni par un créateur : PNG ou JPEG carré (256 px), en data URL. Posé sur
       * le dégradé (utile aux logos transparents), il remplace le glyphe. Jamais de SVG.
       */
      image: z.string().regex(BRAND_IMAGE_RE).max(BRAND_IMAGE_MAX).optional(),
    })
    .optional(),
  /** Base de connaissances : fichiers Markdown dans `src/apps/<slug>/knowledge/`. */
  knowledge: z.object({ enabled: z.boolean().default(true), topK: z.number().int().min(1).max(8).default(3) }).default({ enabled: true, topK: 3 }),
  /**
   * Tâches : l'IA voit les tâches ouvertes de la personne et son coefficient de temps dans
   * son prompt. À activer avec les outils de tâches (brain_dump, next_action, update_task...).
   */
  tasks: z.object({ enabled: z.boolean().default(false), maxInPrompt: z.number().int().min(1).max(40).default(15) }).default({ enabled: false, maxInPrompt: 15 }),
  /** Questionnaires que l'outil `assessment` sait dérouler pour cette IA. */
  assessments: z.array(assessmentSchema).max(5).default([]),
  /**
   * Suggestions cliquables, à droite du fil comme un message de la personne en attente :
   * à l'ouverture et après chaque réponse. Un clic envoie le `prompt` tel quel.
   */
  suggestions: z.array(z.object({ label: localizedText(40), prompt: localizedText(200) })).max(8).default([]),
  /**
   * Libellés lisibles des champs de profil que l'IA écrit elle-même (page mémoire). Les clés
   * d'onboarding et de questionnaire ont déjà leur libellé ; ici, celles des outils de l'IA.
   * Une clé sans libellé s'affiche humanisée (« current_energy » → « Current energy »).
   */
  profileLabels: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/), localizedText(60)).default({}),
  persona: z.object({
    system: z.string().min(20).max(6000),
    tone: z.string().max(300).optional(),
    boundaries: z.array(z.string().max(300)).max(20).default([]),
  }),
  onboarding: z.object({
    intro: localizedText(300).optional(),
    questions: z.array(onboardingQuestionSchema).min(1).max(3),
  }),
  tools: z.object({
    enabled: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/)).default([]),
    overrides: z.record(z.string(), toolOverrideSchema).optional(),
  }),
  /** Surcharges par plan : même forme que la config, chaque champ optionnel. */
  plans: z.partialRecord(z.enum(PLAN_IDS), planConfigSchema.partial()).optional(),
  /**
   * Installation sur l'écran d'accueil. L'icône n'est pas ici : elle est dessinée à partir
   * de `brand` par `/pwa-icons/<slug>-<taille>.png`, donc une IA ne fournit aucun fichier.
   */
  pwa: z.object({
    shortName: z.string().min(1).max(12),
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  kill: z
    .object({
      d7RetentionMin: z.number().min(0).max(1),
      signupsPer10CarouselsMin: z.number().int().min(0),
      reviewAfterWeeks: z.number().int().min(1).max(52),
    })
    .optional(),
  /** Statuts (récompense d'ego, Eyal) : règle structurée, évaluée par `computeStatuses`. */
  statuses: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z_]{2,40}$/),
        label: localizedText(60),
        rule: z.discriminatedUnion('type', [
          z.object({ type: z.literal('onboarding_done') }),
          z.object({ type: z.literal('active_days'), days: z.number().int().min(1).max(365) }),
          z.object({ type: z.literal('artifacts'), count: z.number().int().min(1).max(1000) }),
        ]),
      })
    )
    .max(10)
    .default([]),
  /** Surcharges de la configuration globale, même forme que DEFAULTS (partiel). */
  config: z.record(z.string(), z.unknown()).optional(),
})

export type AppManifestInput = z.input<typeof appManifestSchema>
export type AppDefinition = Readonly<z.output<typeof appManifestSchema>>

export interface Brand {
  from: string
  to: string
  glyph: string
  mark?: string
  image?: string
}

/**
 * Marque effective d'une IA : celle du manifeste, ou, à défaut, sa couleur de thème et
 * l'initiale de son nom. Sert à l'icône affichée comme à l'icône installée, pour qu'elles
 * ne divergent jamais.
 */
export function appBrand(app: AppDefinition, locale: Locale): Brand {
  return app.brand ?? { from: app.pwa.themeColor, to: app.pwa.themeColor, glyph: pick(app.name, locale).slice(0, 1).toUpperCase() }
}

/** Valide et fige un manifeste. Lève au démarrage si le manifeste est invalide. */
export function defineApp(input: AppManifestInput): AppDefinition {
  return Object.freeze(appManifestSchema.parse(input))
}

/** Dérive le schéma Zod du profil depuis les questions d'onboarding. */
export function buildProfileSchema(questions: readonly OnboardingQuestion[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const q of questions) {
    let field: z.ZodTypeAny
    switch (q.type) {
      case 'text':
        field = z.string().trim().min(q.required ? 1 : 0).max(q.maxLength)
        break
      case 'choice':
        field = z.enum(q.options.map((o) => o.value) as [string, ...string[]])
        break
      case 'multi':
        field = z.array(z.enum(q.options.map((o) => o.value) as [string, ...string[]])).max(q.max)
        if (q.required) field = (field as z.ZodArray<z.ZodEnum<Record<string, string>>>).min(1)
        break
      case 'number':
        field = z.number().min(q.min).max(q.max)
        break
    }
    shape[q.key] = q.required ? field : field.optional()
  }
  return z.object(shape).strict()
}
