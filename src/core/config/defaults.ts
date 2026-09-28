/**
 * Réglages globaux : première des trois couches de configuration.
 * Ordre de fusion : DEFAULTS → manifeste d'app → app_settings (DB, portée « all » puis slugs).
 * Un changement ici s'applique à toutes les IA.
 *
 * Les identifiants de modèles sont des réglages, pas des constantes : ils se
 * remplacent par app (manifeste) ou à chaud (admin) sans redéploiement.
 */
export const PLAN_IDS = ['free', 'paid'] as const
export type PlanId = (typeof PLAN_IDS)[number]

export const PROVIDER_IDS = ['openrouter', 'groq', 'openai', 'mistral', 'google'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export type ModelTier = 'big' | 'small'

// Import de type seulement : pas de cycle à l'exécution (schema.ts importe les valeurs d'ici).
import type { PlanConfig } from './schema'

export type ReasoningEffort = 'low' | 'medium' | 'high'

export const DEFAULTS = {
  locales: ['en', 'fr', 'es', 'de', 'it'] as string[],
  defaultLocale: 'en',
  models: {
    // Ordre de repli : le premier disponible (clé présente) répond, le suivant prend le relais en cas d'échec.
    // OpenRouter d'abord (décision du 17 septembre 2026) : le même gpt-oss-120b, hébergé chez Groq ou
    // Cerebras sans le plafond gratuit de 8 000 jetons par minute qui faisait attendre 25 secondes, et
    // une bascule entre hébergeurs gérée par OpenRouter. Les accès directs restent en secours.
    order: ['openrouter', 'groq', 'openai', 'mistral', 'google'] as ProviderId[],
    // Identifiants vérifiés sur le compte Groq le 15 septembre 2026 (GET /openai/v1/models).
    big: {
      openrouter: 'openai/gpt-oss-120b',
      groq: 'openai/gpt-oss-120b',
      openai: 'gpt-5-mini',
      mistral: 'mistral-large-latest',
      google: 'gemini-2.5-flash',
    } as Record<ProviderId, string>,
    small: {
      openrouter: 'google/gemini-2.5-flash-lite',
      groq: 'openai/gpt-oss-20b',
      openai: 'gpt-5-nano',
      mistral: 'mistral-small-latest',
      google: 'gemini-2.5-flash-lite',
    } as Record<ProviderId, string>,
  },
  agent: {
    maxSteps: 5,
    // Fenêtres serrées : chaque millier de tokens d'entrée évité vaut 20 à 30 % du coût d'un message.
    historyWindow: 12,
    maxNotesInPrompt: 20,
    maxArtifactsInPrompt: 8,
    maxOutputTokens: 2048,
    maxUserMessageChars: 4000,
    maxToolOutputChars: 8000,
    temperature: 0.6,
    // Effort de raisonnement des modèles qui en ont un (gpt-oss sur Groq, gpt-5 chez OpenAI).
    // « low » : un appel d'outil ou une réponse courte n'a pas besoin d'une minute de réflexion.
    // Réglable par IA (réglage `agent.reasoning`) si une verticale demande plus de profondeur.
    reasoning: 'low' as ReasoningEffort,
  },
  // Gratuit permanent (décision du 18 septembre 2026) : le même gros modèle que le Pro, des
  // quantités bridées, pas la qualité. 5 messages par jour, une fiche par mois, un rappel actif,
  // le premier passage d'un questionnaire ouvert. Ce qui reste fermé est une raison de payer,
  // pas une punition : la mémoire et les productions existantes restent toujours lisibles.
  // Les abonnés aussi sont bornés : un abonnement à 9 € ne doit jamais coûter plus de quelques dollars d'IA.
  plans: {
    // Plafonds de coût (règle du 18 septembre 2026, calcul dans 09-business.md § 4 bis) : un abonné ne
    // doit jamais coûter plus de la moitié de ce qu'il rapporte net (6,80 € pour 9 € TTC), soit 3,5 $ ;
    // un gratuit, jamais plus de 0,5 $. À 0,001 $ le message, ça laisse 300 messages par jour.
    free: { messagesPerDay: 5, messagesPerMonth: 150, webSearch: false, modelTier: 'big' as ModelTier, artifactsPerMonth: 1, maxUsdPerDay: 0.05, maxUsdPerMonth: 0.5, checkinsActive: 1, assessmentRetake: false },
    paid: { messagesPerDay: 150, messagesPerMonth: 3000, webSearch: true, modelTier: 'big' as ModelTier, artifactsPerMonth: 100, maxUsdPerDay: 0.3, maxUsdPerMonth: 3.5, checkinsActive: 6, assessmentRetake: true },
  } as Record<PlanId, PlanConfig>,
  // Semaine d'accueil retirée le 18 septembre 2026 (0 jour) : le gratuit permanent est la démo.
  // Le mécanisme reste, réglable à chaud (`trial.days`), avec ses plafonds de coût si on le rouvre.
  trial: { days: 0, maxUsdPerDay: 0.1, maxUsdTotal: 0.5 },
  // Offre de bienvenue (décision du 18 septembre 2026) : Pro à moitié prix le premier mois,
  // pendant 72 heures après l'inscription, une seule fois par personne, au mois seulement
  // (l'annuel a déjà ses deux mois offerts). Après, plein tarif, sauf fenêtre promo de l'admin.
  // Offre de bienvenue éteinte le 24/09/2026 (`hours: 0`) : le mécanisme reste, rallumable à chaud
  // depuis Admin → Réglages (`offers.welcome.hours`), ou ici en remettant 72.
  offers: { welcome: { hours: 0, percentOff: 50 }, promo: null as { from: string; until: string } | null },
  // Pub récompensée (décision du 18 septembre 2026) : le mécanisme est prêt, le bouton n'apparaît
  // que si une régie est branchée (`NEXT_PUBLIC_AD_PROVIDER`) et si `ads.enabled` est vrai.
  ads: { enabled: true, rewardMessages: 5, maxVideosPerDay: 3 },
  costGuard: {
    maxUsdPerUserPerDay: 0.5,
    // Modèle absent de la grille `pricing` : tarif volontairement élevé (au-dessus de tout modèle connu),
    // pour que les plafonds continuent de mordre plutôt que de compter zéro.
    unknownModelPrice: { input: 1, output: 4 },
    // Alerte (événement `cost_alert`) quand le coût IA d'une personne sur le mois dépasse ce seuil :
    // un abonné à 9 € qui coûte plus de 2 $ mérite un regard.
    alertUsdPerUserPerMonth: 2,
  },
  // Chaque clic sur une carte fait un ou deux appels (réponse enregistrée, tâche mise à jour) : soixante par heure bloquait un usage normal.
  rateLimits: { chatPerMinute: 20, apiPerHour: 300, publicToolPerDay: 5 },
  // USD par million de tokens, relevés sur les grilles officielles le 16 septembre 2026
  // (Mistral Small : non relu, ordre de grandeur). Le cache d'entrée n'est pas déduit : estimation haute.
  pricing: {
    // Tarifs OpenRouter relevés le 17 septembre 2026 (gpt-oss-120b au prix Groq, l'hébergeur préféré).
    openrouter: {
      'openai/gpt-oss-120b': { input: 0.15, output: 0.6 },
      'google/gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
      'google/gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
    },
    groq: {
      'openai/gpt-oss-120b': { input: 0.15, output: 0.6 },
      'openai/gpt-oss-20b': { input: 0.075, output: 0.3 },
    },
    openai: {
      'gpt-5-mini': { input: 0.25, output: 2 },
      'gpt-5-nano': { input: 0.05, output: 0.4 },
    },
    mistral: {
      'mistral-large-latest': { input: 0.5, output: 1.5 },
      'mistral-small-latest': { input: 0.1, output: 0.3 },
    },
    google: {
      'gemini-2.5-flash': { input: 0.3, output: 2.5 },
      'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
    },
  } as Record<ProviderId, Record<string, { input: number; output: number }>>,
  tools: {
    disabled: [] as string[],
    overrides: {} as Record<string, ToolOverride>,
  },
}

export interface ToolOverride {
  dailyQuota?: number
  requiresPlan?: PlanId
}

export type GlobalDefaults = typeof DEFAULTS
