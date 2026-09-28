import type { AppManifestInput } from '@/apps/types'
import type { ReportSeverity, ReportSource, ReportStatus } from '@/core/reports/schema'

/** Types de données partagés par le cœur. Aucune dépendance à Supabase ici. */
export type Role = 'user' | 'assistant' | 'system'
export type ArtifactType = 'fiche' | 'comparatif'
export type Feedback = 'up' | 'down'

export interface User {
  clerkUserId: string
  email: string | null
  locale: string
  /** Client Stripe, créé au premier paiement et réutilisé ensuite. */
  stripeCustomerId: string | null
  /** Digest hebdomadaire par email (désactivable par un lien dans l'email). */
  digestEnabled: boolean
  lastDigestAt: string | null
  /** Testeur décidé depuis l'admin : voit les IA privées, sans privilège de plan. */
  tester: boolean
  /** Créateur Studio, accordé depuis l'admin : accès à l'espace créateur et au bac à sable. */
  creator: boolean
  /** Remise à zéro des quotas par l'admin : l'usage d'avant ne compte plus. */
  quotaResetAt: string | null
  /** L'offre de bienvenue a été consommée (paiement passé avec le coupon). */
  welcomeOfferUsedAt: string | null
  /** Compte supprimé (Clerk ou admin) : la personne n'existe plus pour l'application. */
  deletedAt: string | null
  /** Contenu effacé et ligne anonymisée par la purge, une fois le délai de grâce passé. */
  purgedAt: string | null
  createdAt: string
}

export interface Profile {
  userId: string
  appSlug: string
  data: Record<string, unknown>
  status: 'onboarding' | 'active'
  updatedAt: string
}

export type NoteSource = 'ai' | 'auto' | 'user'

export interface Note {
  id: string
  userId: string
  appSlug: string
  content: string
  source: NoteSource
  createdAt: string
}

export interface Conversation {
  id: string
  userId: string
  appSlug: string
  title: string
  /** Épinglée : reste en tête de la liste. */
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface StoredMessage {
  id: string
  conversationId: string
  userId: string
  appSlug: string
  role: Role
  parts: unknown[]
  generic: boolean | null
  feedback: Feedback | null
  createdAt: string
}

export interface Artifact {
  id: string
  userId: string
  appSlug: string
  conversationId: string | null
  type: ArtifactType
  title: string
  data: Record<string, unknown>
  publicSlug: string | null
  createdAt: string
}

export interface Subscription {
  userId: string
  appSlug: string // 'flowear' = bundle
  /** Stripe : active, trialing, past_due, canceled... `trialing` sans Stripe = semaine d'accueil, `active` sans Stripe = mois offert. */
  status: string
  currentPeriodEnd: string | null
}

/** Ce qu'un webhook Stripe écrit dans `subscriptions`. */
export interface StripeSubscriptionInput {
  userId: string
  appSlug: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  stripePriceId: string | null
  status: string
  currentPeriodEnd: string | null
  interval: 'month' | 'year' | null
}

/** Ce qu'un webhook Whop écrit dans `subscriptions`. */
export interface WhopSubscriptionInput {
  userId: string
  appSlug: string
  whopMembershipId: string
  status: string
  currentPeriodEnd: string | null
}

/** Adhésion Whop reçue par webhook, rattachée ou en attente d'un compte à cet email. */
export interface WhopMembershipRecord {
  membershipId: string
  whopUserId: string | null
  email: string | null
  productId: string | null
  planId: string | null
  status: string
  renewalPeriodEnd: string | null
  appSlug: string
  userId: string | null
}

/** Un navigateur abonné aux notifications d'une IA, pour une personne. */
export interface PushSubscriptionRecord {
  id: string
  userId: string
  appSlug: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  locale: string
  lastNudgedAt: string | null
}

export type TaskStatus = 'open' | 'done' | 'deferred' | 'dropped'
export type TaskEnergy = 'low' | 'mid' | 'high'
export interface TaskStep {
  title: string
  done: boolean
}

/**
 * Une tâche extraite par une IA : la première action de deux minutes est obligatoire,
 * les étapes n'existent qu'après un découpage. Estimé et réel servent au coefficient de temps.
 */
export interface Task {
  id: string
  userId: string
  appSlug: string
  conversationId: string | null
  title: string
  firstAction: string
  steps: TaskStep[]
  energy: TaskEnergy
  estimateMin: number | null
  actualMin: number | null
  status: TaskStatus
  createdAt: string
  updatedAt: string
  doneAt: string | null
}

export interface TaskInput {
  userId: string
  appSlug: string
  conversationId: string | null
  title: string
  firstAction: string
  energy: TaskEnergy
  estimateMin: number | null
  steps?: TaskStep[]
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'firstAction' | 'steps' | 'energy' | 'estimateMin' | 'actualMin' | 'status'>>

/** Coefficient de temps d'une personne : réel divisé par estimé, sur les tâches finies qui ont les deux. */
export interface TaskTimeStats {
  finished: number
  measured: number
  ratio: number | null
}

export type CheckinKind = 'daily' | 'once'

/**
 * Rappel programmé par la personne : heure locale et fuseau, prochain passage calculé en UTC.
 * `message` est le texte de la notification, `prompt` ce que le chat envoie de sa part à l'ouverture.
 */
export interface Checkin {
  id: string
  userId: string
  appSlug: string
  kind: CheckinKind
  timeLocal: string
  timezone: string
  days: number[] | null
  message: string
  prompt: string
  nextRunAt: string
  lastSentAt: string | null
  active: boolean
  createdAt: string
}

export type CheckinInput = Omit<Checkin, 'id' | 'lastSentAt' | 'active' | 'createdAt'>

/** Une vidéo récompensée : lancée (`pending`) puis confirmée par la régie (`granted`). */
export interface AdReward {
  id: string
  userId: string
  appSlug: string
  /** Jour UTC « YYYY-MM-DD » : le crédit vaut pour ce jour. */
  day: string
  nonce: string
  status: 'pending' | 'granted'
  messages: number
  createdAt: string
  grantedAt: string | null
}

/** Signalement : une personne, ou le système, dit que quelque chose ne va pas. */
/** Inscription à la liste d'attente de Flowear Studio. */
/** IA d'un créateur, brouillon et version publiée. `publishedManifest` est ce que le registre charge. */
export type CreatorAppStatus = 'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'published' | 'suspended'

export interface CreatorKnowledgeFile {
  name: string
  markdown: string
}

/** Ce que le créateur demande en mots à Flowear de construire pour lui. Jamais servi aux utilisateurs. */
export interface CreatorRequests {
  /** Questionnaire décrit en mots : questions, réponses, calcul, source. */
  assessment?: string
}

export interface CreatorApp {
  slug: string
  ownerId: string
  status: CreatorAppStatus
  manifest: AppManifestInput
  knowledge: CreatorKnowledgeFile[]
  requests: CreatorRequests
  version: number
  publishedManifest: AppManifestInput | null
  publishedKnowledge: CreatorKnowledgeFile[] | null
  reviewNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  termsAcceptedAt: string | null
  sharePercent: number
  /** Un lien de statistiques partagé existe (le jeton lui-même n'est jamais relu). */
  shareLinkAt: string | null
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  publishedAt: string | null
}

/** Versement fait à un créateur, enregistré à la main par l'admin. */
export interface CreatorPayout {
  id: string
  slug: string
  amountCents: number
  /** `AAAA-MM-JJ`. */
  paidAt: string
  note: string | null
  createdAt: string
}

/** Résultat d'une vérification automatique, par version soumise. */
export interface CreatorCheck {
  check: string
  ok: boolean
  detail: string | null
}

export interface StudioSignup {
  id: string
  email: string
  idea: string
  audience: string | null
  locale: string
  utm: Record<string, string> | null
  createdAt: string
}

export interface Report {
  id: string
  userId: string | null
  appSlug: string | null
  conversationId: string | null
  messageId: string | null
  source: ReportSource
  category: string
  severity: ReportSeverity
  /** Note sur cinq, seulement pour un avis (`source: 'review'`). */
  rating: number | null
  body: string | null
  status: ReportStatus
  resolution: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}

export interface ReportInput {
  userId?: string | null
  appSlug?: string | null
  conversationId?: string | null
  messageId?: string | null
  source: Report['source']
  category: string
  severity: Report['severity']
  rating?: number | null
  body?: string | null
}

/** Agrégats de l'admin, tels que la base les calcule (vues de la migration 007). */
export interface AdminOverview {
  usersTotal: number
  signupsToday: number
  signupsWeek: number
  signupsMonth: number
  activeToday: number
  activeWeek: number
  activeMonth: number
  messagesToday: number
  messagesWeek: number
  costTodayUsd: number
  costMonthUsd: number
  subscribers: number
  inTrial: number
  reportsNew: number
}

export interface DailyActivity {
  /** Jour UTC, `AAAA-MM-JJ`. */
  day: string
  appSlug: string
  activeUsers: number
  messages: number
  costUsd: number
  latencyP50Ms: number
  latencyP95Ms: number
}

export interface Cohort {
  /** Lundi de la semaine d'inscription, `AAAA-MM-JJ`. */
  week: string
  appSlug: string | null
  signups: number
  d1: number
  d7: number
  d30: number
  eligibleD1: boolean
  eligibleD7: boolean
  eligibleD30: boolean
}

export interface FunnelRow {
  /** `flowear` pour l'ensemble. */
  appSlug: string
  started: number
  onboarded: number
  firstMessage: number
  threeMessages: number
  subscribed: number
}

export interface AppQuality {
  appSlug: string
  answers: number
  thumbsUp: number
  thumbsDown: number
  genericAnswers: number
  toolCalled: number
  toolFailed: number
  fallbacks: number
  quotaHits: number
  openReports: number
}

export interface ConversationStats {
  conversationId: string
  userId: string
  appSlug: string
  title: string
  createdAt: string
  updatedAt: string
  messages: number
  thumbsUp: number
  thumbsDown: number
  genericAnswers: number
}

export interface TrialConversion {
  trialsEnded: number
  converted: number
}

export interface WelcomeConversion {
  signups30d: number
  convertedInWindow: number
  convertedAny: number
  offerUsed: number
}

export interface FreeTierDay {
  /** Jour UTC, `AAAA-MM-JJ`. */
  day: string
  activeFree: number
  costFreeUsd: number
  limitHitUsers: number
  videosGranted: number
}

/** Dépense IA d'une personne sur une IA (admin). */
export interface PersonSpend {
  userId: string
  appSlug: string
  email: string | null
  messages30d: number
  costTodayUsd: number
  cost30dUsd: number
  lastMessageAt: string | null
  plan: 'free' | 'paid' | 'bundle'
}

export interface ChurnMonth {
  churned: number
  atMonthStart: number
}

export interface AttributionRow {
  source: string
  campaign: string
  onboardings: number
}

export interface DailyVisits {
  day: string
  visits: number
  visitors: number
}

/** Tout ce que la base sait d'une personne, pour l'export RGPD. */
export interface UserExport {
  user: User
  profiles: Profile[]
  notes: Note[]
  conversations: { conversation: Conversation; messages: StoredMessage[] }[]
  artifacts: Artifact[]
  subscriptions: Subscription[]
  reports: Report[]
  events: StoredEvent[]
}

export interface StoredEvent {
  id: string
  name: string
  appSlug: string | null
  props: Record<string, unknown>
  createdAt: string
}

export interface UsageRecord {
  userId: string
  appSlug: string
  conversationId?: string | null
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
}

export type EventName =
  | 'signup'
  | 'onboarding_done'
  | 'message_sent'
  | 'tool_called'
  | 'tool_failed'
  | 'artifact_created'
  | 'feedback'
  | 'memory_saved'
  | 'quota_hit'
  | 'trial_started'
  | 'welcome_offer_used'
  | 'payment'
  | 'studio_signup'
  | 'ad_reward_started'
  | 'ad_reward_granted'
  | 'digest_sent'
  | 'checkout_started'
  | 'subscribed'
  | 'churned'
  | 'cost_alert'
  | 'provider_fallback'
  | 'push_enabled'
  | 'push_disabled'
  | 'push_sent'
  | 'checkin_sent'
  | 'task_created'
  | 'task_done'
  | 'report_created'
  | 'admin_action'
  | 'auth_denied'
  | 'rate_limited'

export interface TrackedEvent {
  name: EventName
  userId?: string | null
  appSlug?: string | null
  props?: Record<string, unknown>
  utm?: Record<string, string> | null
}

/** Inscription portant un code créateur (`ref`), pour l'affiliation. */
export interface RefOnboarding {
  userId: string
  ref: string
  createdAt: string
  /** L'IA sur laquelle l'inscription a eu lieu : un affilié limité à une IA ne compte que les siennes. */
  appSlug: string | null
}

/** Chiffres agrégés d'une IA créateur : jamais un identifiant, jamais un contenu. */
export interface CreatorStats {
  onboarded: number
  active7d: number
  active30d: number
  messages7d: number
  messages30d: number
}

export interface ToolRequest {
  id: string
  slug: string
  ownerId: string
  title: string
  body: string
  status: 'open' | 'planned' | 'done' | 'declined'
  createdAt: string
}
