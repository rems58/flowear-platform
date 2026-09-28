import { z } from 'zod'
import { PLAN_IDS, PROVIDER_IDS } from './defaults'

export const MODEL_TIERS = ['big', 'small'] as const

/** Forme d'un plan, déclarée une seule fois : config résolue, type TS et surcharges de manifeste en dérivent. */
export const planConfigSchema = z.object({
  messagesPerDay: z.number().int().min(0),
  messagesPerMonth: z.number().int().min(0),
  webSearch: z.boolean(),
  modelTier: z.enum(MODEL_TIERS),
  artifactsPerMonth: z.number().int().min(0),
  maxUsdPerDay: z.number().min(0),
  maxUsdPerMonth: z.number().min(0),
  /** Rappels programmés actifs en même temps, par IA. */
  checkinsActive: z.number().int().min(0),
  /** Refaire un questionnaire déjà passé (le premier passage est toujours ouvert). */
  assessmentRetake: z.boolean(),
})
export type PlanConfig = z.infer<typeof planConfigSchema>

/** Schéma de la configuration résolue d'une app (après fusion des trois couches). */
export const toolOverrideSchema = z.object({
  dailyQuota: z.number().int().min(0).optional(),
  requiresPlan: z.enum(PLAN_IDS).optional(),
})

export const appConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,32}$/),
  locales: z.array(z.string().min(2).max(5)).min(1),
  defaultLocale: z.string().min(2).max(5),
  models: z.object({
    order: z.array(z.enum(PROVIDER_IDS)).min(1),
    big: z.record(z.enum(PROVIDER_IDS), z.string().min(1)),
    small: z.record(z.enum(PROVIDER_IDS), z.string().min(1)),
  }),
  agent: z.object({
    maxSteps: z.number().int().min(1).max(20),
    historyWindow: z.number().int().min(2).max(200),
    maxNotesInPrompt: z.number().int().min(0).max(200),
    maxArtifactsInPrompt: z.number().int().min(0).max(50),
    maxOutputTokens: z.number().int().min(64).max(32000),
    maxUserMessageChars: z.number().int().min(100).max(20000),
    maxToolOutputChars: z.number().int().min(200).max(50000),
    temperature: z.number().min(0).max(2),
    reasoning: z.enum(['low', 'medium', 'high']),
  }),
  plans: z.record(z.enum(PLAN_IDS), planConfigSchema),
  /** Offre de bienvenue : Pro à moitié prix le premier mois, pendant N heures après l'inscription. 0 heure = éteinte. */
  /** Pub récompensée : messages gagnés par vidéo et vidéos par jour. `enabled` n'agit que si une régie est configurée. */
  ads: z.object({ enabled: z.boolean(), rewardMessages: z.number().int().min(1).max(50), maxVideosPerDay: z.number().int().min(0).max(20) }),
  offers: z.object({
    welcome: z.object({ hours: z.number().int().min(0).max(720), percentOff: z.number().int().min(1).max(90) }),
    /** Fenêtre promo décidée par l'admin : même remise que l'offre de bienvenue, pour tous les gratuits, entre deux dates. */
    promo: z.object({ from: z.string().datetime(), until: z.string().datetime() }).nullable(),
  }),
  trial: z.object({
    days: z.number().int().min(0).max(90),
    /** Plafonds de coût IA pendant la semaine d'accueil, plus bas que ceux du payant : c'est du gratuit. */
    maxUsdPerDay: z.number().min(0),
    maxUsdTotal: z.number().min(0),
  }),
  costGuard: z.object({
    maxUsdPerUserPerDay: z.number().min(0),
    alertUsdPerUserPerMonth: z.number().min(0),
    unknownModelPrice: z.object({ input: z.number().min(0), output: z.number().min(0) }),
  }),
  rateLimits: z.object({
    chatPerMinute: z.number().int().min(1),
    apiPerHour: z.number().int().min(1),
    publicToolPerDay: z.number().int().min(0),
  }),
  pricing: z.record(
    z.enum(PROVIDER_IDS),
    z.record(z.string(), z.object({ input: z.number().min(0), output: z.number().min(0) }))
  ),
  tools: z.object({
    enabled: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/)),
    disabled: z.array(z.string()),
    overrides: z.record(z.string(), toolOverrideSchema),
  }),
})

export type AppConfig = z.infer<typeof appConfigSchema>

/** Une ligne de `app_settings` : un réglage ciblé, à chaud, sans redéploiement. */
export const appSettingSchema = z.object({
  scope: z.union([z.literal('all'), z.array(z.string().regex(/^[a-z0-9-]{2,32}$/)).min(1)]),
  key: z.string().regex(/^[a-zA-Z0-9_.]{1,80}$/),
  value: z.unknown(),
})

export type AppSetting = z.infer<typeof appSettingSchema>
