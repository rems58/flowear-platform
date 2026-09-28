import type { AppManifestInput } from '@/apps/types'
import type { Affiliate, AffiliatePayment } from '@/core/growth/affiliates'
import type { AppSetting } from '@/core/config/schema'
import type {
  PersonSpend,
  WelcomeConversion,
  FreeTierDay, AdReward, StripeSubscriptionInput, RefOnboarding, WhopSubscriptionInput, WhopMembershipRecord, StudioSignup, CreatorApp, CreatorKnowledgeFile, CreatorCheck, CreatorStats, ToolRequest, CreatorRequests, CreatorPayout } from './types'
import type {
  AdminOverview,
  AppQuality,
  Artifact,
  ArtifactType,
  AttributionRow,
  Checkin,
  CheckinInput,
  ChurnMonth,
  Cohort,
  Conversation,
  ConversationStats,
  DailyActivity,
  DailyVisits,
  Feedback,
  FunnelRow,
  Note,
  NoteSource,
  Profile,
  PushSubscriptionRecord,
  Report,
  ReportInput,
  Role,
  StoredEvent,
  StoredMessage,
  Subscription,
  Subscription as Sub,
  Task,
  TaskInput,
  TaskPatch,
  TaskTimeStats,
  TrackedEvent,
  TrialConversion,
  UsageRecord,
  User,
  UserExport,
} from './types'
import type { PaidSubscription } from '@/core/admin/revenue'

/**
 * Contrat d'accès aux données. Le cœur ne voit que cette interface.
 * Règle IDOR : chaque méthode qui lit ou modifie une ressource d'utilisateur
 * prend `userId` et filtre dessus. Aucune méthode « get par id » sans propriétaire.
 */
export interface Repo {
  users: {
    upsert(input: { clerkUserId: string; email?: string | null; locale?: string }): Promise<User>
    get(clerkUserId: string): Promise<User | null>
    /** Personne vivante portant cet email (comparaison insensible à la casse). */
    getByEmail(email: string): Promise<User | null>
    markDeleted(clerkUserId: string, at?: Date): Promise<void>
    /** Comptes supprimés avant `before` et pas encore purgés, les plus anciens d'abord. */
    listToPurge(before: Date, limit: number): Promise<User[]>
    markPurged(clerkUserId: string, at: Date): Promise<void>
    /** Personnes avec email, digest activé, non servies depuis `before`. */
    listDigestCandidates(before: Date, limit: number): Promise<User[]>
    setDigest(clerkUserId: string, enabled: boolean): Promise<void>
    /** Le coupon de bienvenue a servi : plus jamais proposé à cette personne. */
    markWelcomeOfferUsed(clerkUserId: string, at: Date): Promise<void>
    markDigestSent(clerkUserId: string, at: Date): Promise<void>
    setStripeCustomerId(clerkUserId: string, customerId: string): Promise<void>
    /** Admin : les personnes, les plus récentes d'abord, filtrées par un bout d'email. */
    list(query: string | null, limit: number): Promise<User[]>
    setTester(clerkUserId: string, enabled: boolean): Promise<void>
    setCreator(clerkUserId: string, enabled: boolean): Promise<void>
    resetQuota(clerkUserId: string, at: Date): Promise<void>
    /**
     * Effacement RGPD, en deux temps pour pouvoir reprendre si Clerk échoue entre les deux.
     * `eraseContent` supprime profils, souvenirs, conversations, productions, signalements,
     * notifications et abonnements sans Stripe ; rejouable. `anonymize` vide ensuite la ligne
     * (email, client Stripe) et la marque supprimée : elle ne dit plus qui c'était. L'usage
     * et les événements restent, pseudonymes, pour la comptabilité et le journal.
     */
    eraseContent(clerkUserId: string): Promise<void>
    anonymize(clerkUserId: string): Promise<void>
    /** Tout ce que la base sait d'une personne, pour la portabilité. */
    exportAll(clerkUserId: string): Promise<UserExport | null>
  }
  profiles: {
    get(userId: string, appSlug: string): Promise<Profile | null>
    upsert(userId: string, appSlug: string, data: Record<string, unknown>, status: Profile['status']): Promise<Profile>
    patch(userId: string, appSlug: string, patch: Record<string, unknown>): Promise<Profile>
    removeKey(userId: string, appSlug: string, key: string): Promise<Profile | null>
  }
  notes: {
    list(userId: string, appSlug: string, limit: number): Promise<Note[]>
    listSince(userId: string, appSlug: string, since: Date, limit: number): Promise<Note[]>
    countSince(userId: string, appSlug: string, since: Date): Promise<number>
    add(userId: string, appSlug: string, content: string, source?: NoteSource): Promise<Note>
    update(id: string, userId: string, content: string): Promise<Note | null>
    remove(id: string, userId: string): Promise<boolean>
  }
  conversations: {
    create(userId: string, appSlug: string, title: string): Promise<Conversation>
    get(id: string, userId: string, appSlug: string): Promise<Conversation | null>
    latest(userId: string, appSlug: string): Promise<Conversation | null>
    list(userId: string, appSlug: string, limit: number): Promise<Conversation[]>
    touch(id: string, userId: string, title?: string): Promise<void>
    /** Épingle ou désépingle ; faux si la conversation n'est pas à cette personne. */
    setPinned(id: string, userId: string, pinned: boolean): Promise<boolean>
  }
  messages: {
    list(conversationId: string, userId: string, limit: number): Promise<StoredMessage[]>
    append(input: {
      id: string
      conversationId: string
      userId: string
      appSlug: string
      role: Role
      parts: unknown[]
      generic?: boolean | null
    }): Promise<StoredMessage>
    setFeedback(messageId: string, userId: string, feedback: Feedback, reason?: string | null): Promise<boolean>
    /** Un message de la personne, pour vérifier qu'un signalement porte bien sur le sien. */
    find(messageId: string, userId: string): Promise<StoredMessage | null>
  }
  artifacts: {
    create(input: {
      userId: string
      appSlug: string
      conversationId?: string | null
      type: ArtifactType
      title: string
      data: Record<string, unknown>
    }): Promise<Artifact>
    get(id: string, userId: string): Promise<Artifact | null>
    list(userId: string, appSlug: string, limit: number): Promise<Artifact[]>
    listSince(userId: string, appSlug: string, since: Date, limit: number): Promise<Artifact[]>
    countSince(userId: string, appSlug: string, since: Date): Promise<number>
  }
  events: {
    track(event: TrackedEvent): Promise<void>
    /** Admin : la frise d'une personne, du plus récent au plus ancien. */
    listForUser(userId: string, limit: number): Promise<StoredEvent[]>
    /** Affiliation : toutes les inscriptions (`onboarding_done`) portant un `ref`. */
    listRefOnboardings(): Promise<RefOnboarding[]>
    /** Affiliation : date du premier paiement (`subscribed` avec abonnement Stripe) de chaque personne donnée. */
    firstPaidAt(userIds: string[]): Promise<Map<string, string>>
    /** Affiliation : paiements encaissés (`payment`) des personnes données. */
    listPayments(userIds: string[]): Promise<AffiliatePayment[]>
    /** Studio : tous les paiements encaissés pour une IA (événements `payment` portant son slug). */
    listPaymentsForApp(appSlug: string): Promise<AffiliatePayment[]>
  }
  studioWaitlist: {
    /** `exists` si cet email est déjà inscrit : on ne compte personne deux fois. */
    add(input: { email: string; idea: string; audience: string | null; locale: string; utm: Record<string, string> | null }): Promise<'added' | 'exists'>
    count(): Promise<number>
    /** Admin : les inscrits, les plus récents d'abord. */
    list(limit: number): Promise<StudioSignup[]>
  }
  affiliates: {
    list(): Promise<Affiliate[]>
    create(input: { code: string; name: string; contact: string | null; payoutEur: number; percent: number | null; months: number | null; appSlug: string | null }): Promise<Affiliate>
    remove(code: string): Promise<void>
  }
  usage: {
    record(usage: UsageRecord): Promise<void>
    countMessagesToday(userId: string, appSlug: string, now: Date): Promise<number>
    costTodayUsd(userId: string, appSlug: string, now: Date): Promise<number>
    /** Coût IA de la personne sur l'app depuis le premier jour du mois (UTC). */
    costMonthUsd(userId: string, appSlug: string, now: Date): Promise<number>
    costSince(userId: string, appSlug: string, since: Date): Promise<number>
    countMessagesSince(userId: string, appSlug: string, since: Date): Promise<number>
    /** Nombre de jours civils UTC distincts avec au moins un message depuis `since`. */
    activeDays(userId: string, appSlug: string, since: Date): Promise<number>
    /** Date du dernier message envoyé à cette IA, `null` si la personne n'a jamais écrit. */
    lastMessageAt(userId: string, appSlug: string): Promise<Date | null>
  }
  appSettings: {
    list(): Promise<AppSetting[]>
    /** Pose ou remplace un réglage pour cette portée et cette clé. */
    upsert(setting: AppSetting, by: string): Promise<void>
    remove(scope: AppSetting['scope'], key: string): Promise<void>
  }
  visits: {
    /** Une visite anonyme, dédoublonnée par jour, chemin et empreinte. */
    record(input: { day: string; path: string; utm: Record<string, string> | null; visitorHash: string }): Promise<void>
  }
  subscriptions: {
    listActive(userId: string): Promise<Subscription[]>
    /** Semaine d'accueil : crée une ligne `trialing` si la personne n'a jamais eu d'abonnement sur cette IA. */
    startTrial(userId: string, appSlug: string, endsAt: Date): Promise<boolean>
    /** Webhook Stripe : crée ou met à jour la ligne d'un abonnement, identifiée par son id Stripe. */
    upsertFromStripe(input: StripeSubscriptionInput): Promise<void>
    /** Webhook Whop : idem, identifiée par l'id d'adhésion Whop. */
    upsertFromWhop(input: WhopSubscriptionInput): Promise<void>
    /** La personne a un abonnement en cours encaissé par Whop (géré là-bas, pas sur le portail Stripe). */
    hasWhop(userId: string): Promise<boolean>
    /** Semaine d'accueil en cours ou finie : repousse sa fin. `false` s'il n'y en a jamais eu. */
    extendTrial(userId: string, appSlug: string, days: number, now: Date): Promise<boolean>
    /** Mois offert : une ligne `active` sans Stripe sur le bundle, qui prolonge un cadeau en cours. */
    gift(userId: string, appSlug: string, days: number, now: Date): Promise<void>
    /** Identifiants Stripe des abonnements encore ouverts d'une personne : à résilier avant de l'effacer. */
    listStripeIds(userId: string): Promise<string[]>
  }
  push: {
    /** Abonne ce navigateur à cette IA, ou rafraîchit ses clés s'il revient. */
    save(input: { userId: string; appSlug: string; endpoint: string; p256dh: string; auth: string; locale: string }): Promise<void>
    /** Désabonnement demandé par la personne : l'endpoint doit lui appartenir. */
    remove(userId: string, appSlug: string, endpoint: string): Promise<boolean>
    /** Désabonnement forcé : le service de push a répondu que l'endpoint n'existe plus, pour toutes les IA. */
    removeExpired(endpoint: string): Promise<void>
    /** Nombre de navigateurs abonnés à cette IA : état initial du bouton, rendu côté serveur. */
    countForApp(userId: string, appSlug: string): Promise<number>
    /** Relances : abonnements non examinés depuis `before`, les plus anciens d'abord. */
    listDue(before: Date, limit: number): Promise<PushSubscriptionRecord[]>
    /** Marque le passage de la relance, qu'elle ait été envoyée ou écartée. */
    markNudged(id: string, at: Date): Promise<void>
    /** Tous les navigateurs abonnés à une IA : sert au slug réservé de l'admin. */
    listForApp(appSlug: string): Promise<PushSubscriptionRecord[]>
    /** Navigateurs d'une personne pour une IA : un rappel programmé part sur chacun. */
    listForUserApp(userId: string, appSlug: string): Promise<PushSubscriptionRecord[]>
  }
  tasks: {
    createMany(inputs: TaskInput[]): Promise<Task[]>
    get(id: string, userId: string, appSlug: string): Promise<Task | null>
    /** Tâches ouvertes ou reportées, les plus anciennes d'abord. */
    listOpen(userId: string, appSlug: string, limit: number): Promise<Task[]>
    /** Toutes les tâches, tous états, les plus récentes d'abord : le panneau. */
    listAll(userId: string, appSlug: string, limit: number): Promise<Task[]>
    /** Titres proches : évite de recréer une tâche que la personne vient de dicter deux fois. */
    findByTitle(userId: string, appSlug: string, title: string): Promise<Task | null>
    update(id: string, userId: string, patch: TaskPatch): Promise<Task | null>
    timeStats(userId: string, appSlug: string): Promise<TaskTimeStats>
  }
  checkins: {
    create(input: CheckinInput): Promise<Checkin>
    list(userId: string, appSlug: string): Promise<Checkin[]>
    get(id: string, userId: string, appSlug: string): Promise<Checkin | null>
    /** Rappels actifs dont l'heure est passée, les plus anciens d'abord. */
    listDue(before: Date, limit: number): Promise<Checkin[]>
    /** Après envoi : prochain passage, ou désactivation pour un rappel unique. */
    advance(id: string, nextRunAt: Date | null, sentAt: Date): Promise<void>
    setActive(id: string, userId: string, active: boolean): Promise<boolean>
    remove(id: string, userId: string): Promise<boolean>
  }
  rewards: {
    /** Une vidéo lancée : ligne en attente, identifiée par un nonce à usage unique. */
    start(input: { userId: string; appSlug: string; day: string; nonce: string; messages: number }): Promise<AdReward>
    /** La régie a confirmé : la ligne passe à `granted` si elle est à cette personne, en attente, et récente. Sinon null. */
    grant(nonce: string, userId: string, at: Date, maxAgeMs: number): Promise<AdReward | null>
    /** Le jour : vidéos confirmées et messages gagnés. */
    today(userId: string, appSlug: string, day: string): Promise<{ videos: number; messages: number }>
  }
  reports: {
    create(input: ReportInput): Promise<Report>
    get(id: string): Promise<Report | null>
    list(filter: { status?: Report['status'] | null; limit: number }): Promise<Report[]>
    listForUser(userId: string, limit: number): Promise<Report[]>
    /** Changement d'état par l'admin, avec qui l'a fait ; `null` si le signalement n'existe pas. */
    setStatus(id: string, status: Report['status'], resolution: string | null, by: string): Promise<Report | null>
    /** Nombre de signalements à traiter : le badge de la colonne, compté par la base. */
    countNew(): Promise<number>
  }
  /** Agrégats de l'admin : calculés par la base (vues), jamais en boucle côté serveur. */
  admin: {
    overview(): Promise<AdminOverview>
    dailyActivity(days: number, appSlug?: string): Promise<DailyActivity[]>
    /** Cohortes globales (`appSlug` absent) ou d'une IA, de la plus récente à la plus ancienne. */
    cohorts(appSlug?: string): Promise<Cohort[]>
    /** Entonnoir de toutes les IA, ou d'une seule (`appSlug`). */
    funnel(appSlug?: string): Promise<FunnelRow[]>
    quality(): Promise<AppQuality[]>
    conversationStats(userId: string, limit: number): Promise<ConversationStats[]>
    /** Une conversation de la personne, par son id ; `null` si elle n'est pas à elle. */
    conversationStat(userId: string, conversationId: string): Promise<ConversationStats | null>
    /** Premier onboarding terminé sur une IA : sa date de lancement réelle. */
    launchedAt(appSlug: string): Promise<Date | null>
    paidSubscriptions(): Promise<PaidSubscription[]>
    trialConversion(): Promise<TrialConversion>
    /** Inscrits des 30 derniers jours : convertis dans les 72 h, convertis tout court, offre consommée. */
    welcomeConversion(): Promise<WelcomeConversion>
    /** Le gratuit jour par jour (14 jours) : actifs jamais payés, coût IA, limite touchée, vidéos. */
    freeTierDays(): Promise<FreeTierDay[]>
    churnMonth(): Promise<ChurnMonth>
    /** Dépense par personne et par IA sur 30 jours, filtrable par IA, triée par coût 30 jours. */
    peopleSpend(appSlug: string | null, order: 'desc' | 'asc', limit: number): Promise<PersonSpend[]>
    attribution(): Promise<AttributionRow[]>
    dailyVisits(days: number): Promise<DailyVisits[]>
    /** Personnes distinctes ayant écrit dans les sept derniers jours, par IA. */
    weeklyActive(): Promise<Record<string, number>>
  }
  /** Idempotence des webhooks : `true` si l'événement est nouveau, `false` s'il a déjà été traité. */
  whopMemberships: {
    upsert(record: WhopMembershipRecord): Promise<void>
    /** Adhésions encore valides et sans compte rattaché, pour cet email. */
    listPendingByEmail(email: string): Promise<WhopMembershipRecord[]>
    attach(membershipId: string, userId: string): Promise<void>
  }
  creatorApps: {
    /** Les IA en ligne, pour le registre : une version publiée existe et l'IA n'est pas suspendue. */
    listPublished(): Promise<CreatorApp[]>
    get(slug: string): Promise<CreatorApp | null>
    listByOwner(ownerId: string): Promise<CreatorApp[]>
    /** Crée le brouillon ou le remplace (même slug, même propriétaire). Le slug n'est jamais recyclé. */
    saveDraft(input: { slug: string; ownerId: string; manifest: AppManifestInput; knowledge: CreatorKnowledgeFile[]; requests?: CreatorRequests }): Promise<CreatorApp>
    /** Admin : Flowear pose dans le brouillon ce qu'il a construit (le questionnaire décrit en mots). */
    setAssessments(slug: string, assessments: unknown[] | undefined): Promise<void>
    /** Admin : la file, par ancienneté de soumission. */
    listByStatus(statuses: CreatorApp['status'][]): Promise<CreatorApp[]>
    /** Fige le brouillon courant comme version en ligne. */
    publish(slug: string, reviewerId: string, input?: { sharePercent?: number }): Promise<void>
    suspend(slug: string, reviewerId: string, reason: string): Promise<void>
    /** Demande de changements : l'IA en ligne le reste, le brouillon repart en travail. */
    requestChanges(slug: string, reviewerId: string, notes: string): Promise<void>
    /** Soumission : statut `submitted`, version et date d'acceptation des CGU. */
    submit(slug: string, input: { version: number; termsAcceptedAt: string }): Promise<void>
    saveChecks(slug: string, version: number, results: CreatorCheck[]): Promise<void>
    listChecks(slug: string, version: number): Promise<CreatorCheck[]>
    /** Lien de statistiques : empreinte du jeton, ou `null` pour le révoquer. */
    setShareToken(slug: string, hash: string | null): Promise<void>
    getByShareTokenHash(hash: string): Promise<CreatorApp | null>
    /** Admin : toutes les IA de créateurs, sauf les brouillons jamais soumis. */
    listAll(): Promise<CreatorApp[]>
    /** Chiffres agrégés d'une IA : profils actifs, personnes et messages sur 7 et 30 jours. */
    stats(slug: string, now: Date): Promise<CreatorStats>
  }
  creatorPayouts: {
    create(input: { slug: string; amountCents: number; paidAt: string; note: string | null; createdBy: string }): Promise<CreatorPayout>
    list(slug: string): Promise<CreatorPayout[]>
  }
  toolRequests: {
    create(input: { slug: string; ownerId: string; title: string; body: string }): Promise<ToolRequest>
    listBySlug(slug: string): Promise<ToolRequest[]>
    setStatus(id: string, status: ToolRequest['status']): Promise<void>
  }
  creatorEvents: {
    log(input: { slug: string; actorId: string | null; action: string; details?: Record<string, unknown> }): Promise<void>
  }
  stripeEvents: {
    markProcessed(id: string, type: string): Promise<boolean>
    /** Traitement échoué : l'événement redevient neuf pour que le rejeu de Stripe agisse. */
    forget(id: string): Promise<void>
  }
  audit: {
    /** Trace au mieux : une erreur d'écriture est journalisée, jamais remontée. */
    log(input: { userId?: string | null; action: string; details?: Record<string, unknown>; ip?: string | null }): Promise<void>
    /** Trace exigée : lève si l'écriture échoue. Pour ce qui ne doit jamais arriver sans trace. */
    require(input: { userId?: string | null; action: string; details?: Record<string, unknown>; ip?: string | null }): Promise<void>
  }
}

export type { Sub }
