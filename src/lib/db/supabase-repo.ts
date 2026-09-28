import type { Affiliate } from '@/core/growth/affiliates'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppSetting } from '@/core/config/schema'
import { appSettingSchema } from '@/core/config/schema'
import type { Repo } from '@/core/data/repo'
import { startOfUtcDay, startOfUtcMonth } from '@/core/data/time'
import { withAssessments } from '@/core/studio/manifest'
import type {
  PersonSpend,
  WelcomeConversion,
  FreeTierDay,
  AdReward,
  AdminOverview,
  Checkin,
  AppQuality,
  Artifact,
  AttributionRow,
  ChurnMonth,
  Cohort,
  Conversation,
  ConversationStats,
  DailyActivity,
  DailyVisits,
  FunnelRow,
  Note,
  Profile,
  PushSubscriptionRecord,
  Report,
  StoredEvent,
  StoredMessage,
  Subscription,
  Task,
  TrialConversion,
  User,
  CreatorApp,
  CreatorKnowledgeFile,
  CreatorCheck,
  CreatorStats,
  ToolRequest,
  CreatorPayout,
} from '@/core/data/types'
import type { PaidSubscription } from '@/core/admin/revenue'

type Row = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''))
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))

function fail(op: string, error: { message: string } | null): never {
  throw new Error(`[db] ${op} : ${error?.message ?? 'erreur inconnue'}`)
}

const toCreatorApp = (r: Row): CreatorApp => ({
  slug: str(r.slug),
  ownerId: str(r.owner_id),
  status: str(r.status) as CreatorApp['status'],
  manifest: r.manifest as CreatorApp['manifest'],
  knowledge: (r.knowledge as CreatorKnowledgeFile[] | null) ?? [],
  requests: (r.requests as CreatorApp['requests'] | null) ?? {},
  version: num(r.version),
  publishedManifest: (r.published_manifest as CreatorApp['manifest'] | null) ?? null,
  publishedKnowledge: (r.published_knowledge as CreatorKnowledgeFile[] | null) ?? null,
  reviewNotes: (r.review_notes as string | null) ?? null,
  reviewedBy: (r.reviewed_by as string | null) ?? null,
  reviewedAt: (r.reviewed_at as string | null) ?? null,
  termsAcceptedAt: (r.terms_accepted_at as string | null) ?? null,
  sharePercent: num(r.share_percent ?? 50),
  shareLinkAt: (r.share_token_created_at as string | null) ?? null,
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
  submittedAt: (r.submitted_at as string | null) ?? null,
  publishedAt: (r.published_at as string | null) ?? null,
})

const toPayment = (r: Row) => ({ userId: str(r.user_id), amountCents: num(((r.props ?? {}) as Record<string, unknown>).amountCents), createdAt: str(r.created_at), appSlug: (r.app_slug as string | null) ?? null })
const toToolRequest = (r: Row): ToolRequest => ({ id: str(r.id), slug: str(r.slug), ownerId: str(r.owner_id), title: str(r.title), body: str(r.body), status: str(r.status) as ToolRequest['status'], createdAt: str(r.created_at) })

const toPayout = (r: Row): CreatorPayout => ({ id: str(r.id), slug: str(r.slug), amountCents: num(r.amount_cents), paidAt: str(r.paid_at), note: (r.note as string | null) ?? null, createdAt: str(r.created_at) })

const SETTINGS_TTL_MS = 60_000
let settingsCache: { value: AppSetting[]; until: number } | null = null

const toUser = (r: Row): User => ({
  clerkUserId: str(r.clerk_user_id),
  email: (r.email as string | null) ?? null,
  locale: str(r.locale || 'en'),
  stripeCustomerId: (r.stripe_customer_id as string | null) ?? null,
  digestEnabled: r.digest_enabled !== false,
  lastDigestAt: (r.last_digest_at as string | null) ?? null,
  tester: r.tester === true,
  creator: r.creator === true,
  quotaResetAt: (r.quota_reset_at as string | null) ?? null,
  welcomeOfferUsedAt: (r.welcome_offer_used_at as string | null) ?? null,
  deletedAt: (r.deleted_at as string | null) ?? null,
  purgedAt: (r.purged_at as string | null) ?? null,
  createdAt: str(r.created_at),
})
const toAffiliate = (r: Row): Affiliate => ({ code: str(r.code), name: str(r.name), contact: (r.contact as string | null) ?? null, payoutEur: num(r.payout_eur), percent: r.percent === null || r.percent === undefined ? null : num(r.percent), months: r.months === null || r.months === undefined ? null : num(r.months), appSlug: (r.app_slug as string | null) ?? null, createdAt: str(r.created_at) })
const toProfile = (r: Row): Profile => ({
  userId: str(r.user_id),
  appSlug: str(r.app_slug),
  data: (r.data as Record<string, unknown>) ?? {},
  status: r.status === 'active' ? 'active' : 'onboarding',
  updatedAt: str(r.updated_at),
})
const toNote = (r: Row): Note => ({
  id: str(r.id),
  userId: str(r.user_id),
  appSlug: str(r.app_slug),
  content: str(r.content),
  source: (['ai', 'auto', 'user'].includes(str(r.source)) ? str(r.source) : 'ai') as Note['source'],
  createdAt: str(r.created_at),
})
const toConversation = (r: Row): Conversation => ({
  id: str(r.id),
  userId: str(r.user_id),
  appSlug: str(r.app_slug),
  title: str(r.title),
  pinned: Boolean(r.pinned),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
})
const toMessage = (r: Row): StoredMessage => ({
  id: str(r.id),
  conversationId: str(r.conversation_id),
  userId: str(r.user_id),
  appSlug: str(r.app_slug),
  role: r.role as StoredMessage['role'],
  parts: (r.parts as unknown[]) ?? [],
  generic: (r.generic as boolean | null) ?? null,
  feedback: (r.feedback as StoredMessage['feedback']) ?? null,
  createdAt: str(r.created_at),
})
const toPushSubscription = (r: Row): PushSubscriptionRecord => ({
  id: str(r.id),
  userId: str(r.user_id),
  appSlug: str(r.app_slug),
  endpoint: str(r.endpoint),
  keys: { p256dh: str(r.p256dh), auth: str(r.auth) },
  locale: str(r.locale || 'en'),
  lastNudgedAt: (r.last_nudged_at as string | null) ?? null,
})
const bool = (v: unknown): boolean => v === true
const toTask = (r: Row): Task => ({
  id: str(r.id),
  userId: str(r.user_id),
  appSlug: str(r.app_slug),
  conversationId: (r.conversation_id as string | null) ?? null,
  title: str(r.title),
  firstAction: str(r.first_action),
  steps: Array.isArray(r.steps) ? (r.steps as Task['steps']) : [],
  energy: r.energy === 'low' || r.energy === 'high' ? r.energy : 'mid',
  estimateMin: typeof r.estimate_min === 'number' ? r.estimate_min : null,
  actualMin: typeof r.actual_min === 'number' ? r.actual_min : null,
  status: r.status === 'done' || r.status === 'deferred' || r.status === 'dropped' ? r.status : 'open',
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
  doneAt: (r.done_at as string | null) ?? null,
})
const toCheckin = (r: Row): Checkin => ({
  id: str(r.id),
  userId: str(r.user_id),
  appSlug: str(r.app_slug),
  kind: r.kind === 'once' ? 'once' : 'daily',
  timeLocal: str(r.time_local),
  timezone: str(r.timezone),
  days: Array.isArray(r.days) ? (r.days as number[]) : null,
  message: str(r.message),
  prompt: str(r.prompt),
  nextRunAt: str(r.next_run_at),
  lastSentAt: (r.last_sent_at as string | null) ?? null,
  active: r.active !== false,
  createdAt: str(r.created_at),
})
const toReward = (r: Row): AdReward => ({
  id: str(r.id),
  userId: str(r.user_id),
  appSlug: str(r.app_slug),
  day: str(r.day),
  nonce: str(r.nonce),
  status: r.status as AdReward['status'],
  messages: num(r.messages),
  createdAt: str(r.created_at),
  grantedAt: (r.granted_at as string | null) ?? null,
})
const toReport = (r: Row): Report => ({
  id: str(r.id),
  userId: (r.user_id as string | null) ?? null,
  appSlug: (r.app_slug as string | null) ?? null,
  conversationId: (r.conversation_id as string | null) ?? null,
  messageId: (r.message_id as string | null) ?? null,
  source: r.source as Report['source'],
  category: str(r.category),
  severity: r.severity as Report['severity'],
  rating: (r.rating as number | null) ?? null,
  body: (r.body as string | null) ?? null,
  status: r.status as Report['status'],
  resolution: (r.resolution as string | null) ?? null,
  resolvedBy: (r.resolved_by as string | null) ?? null,
  resolvedAt: (r.resolved_at as string | null) ?? null,
  createdAt: str(r.created_at),
})
const toEvent = (r: Row): StoredEvent => ({
  id: str(r.id),
  name: str(r.name),
  appSlug: (r.app_slug as string | null) ?? null,
  props: (r.props as Record<string, unknown>) ?? {},
  createdAt: str(r.created_at),
})
const toCohort = (r: Row): Cohort => ({
  week: str(r.week),
  appSlug: (r.app_slug as string | null) ?? null,
  signups: num(r.signups),
  d1: num(r.d1),
  d7: num(r.d7),
  d30: num(r.d30),
  eligibleD1: bool(r.eligible_d1),
  eligibleD7: bool(r.eligible_d7),
  eligibleD30: bool(r.eligible_d30),
})
const toArtifact = (r: Row): Artifact => ({
  id: str(r.id),
  userId: str(r.user_id),
  appSlug: str(r.app_slug),
  conversationId: (r.conversation_id as string | null) ?? null,
  type: r.type as Artifact['type'],
  title: str(r.title),
  data: (r.data as Record<string, unknown>) ?? {},
  publicSlug: (r.public_slug as string | null) ?? null,
  createdAt: str(r.created_at),
})
const toSubscription = (r: Row): Subscription => ({
  userId: str(r.user_id),
  appSlug: str(r.app_slug),
  status: str(r.status),
  currentPeriodEnd: (r.current_period_end as string | null) ?? null,
})

/**
 * Implémentation Supabase du contrat `Repo`.
 * Chaque requête sur une ressource d'utilisateur filtre par `user_id` : c'est la
 * première ligne de défense IDOR, la RLS est la seconde.
 */
export function createSupabaseRepo(db: SupabaseClient): Repo {
  const repo: Repo = {
    users: {
      async upsert({ clerkUserId, email, locale }) {
        // Un champ absent n'écrase pas la valeur existante (l'email vient du webhook, la locale de l'onboarding).
        const patch: Row = { clerk_user_id: clerkUserId, updated_at: new Date().toISOString() }
        if (email !== undefined) patch.email = email
        if (locale) patch.locale = locale
        const { data, error } = await db.from('users').upsert(patch, { onConflict: 'clerk_user_id' }).select().single()
        if (error) fail('users.upsert', error)
        return toUser(data as Row)
      },
      async get(clerkUserId) {
        const { data, error } = await db.from('users').select().eq('clerk_user_id', clerkUserId).is('deleted_at', null).maybeSingle()
        if (error) fail('users.get', error)
        return data ? toUser(data as Row) : null
      },
      async getByEmail(email) {
        const { data, error } = await db.from('users').select().ilike('email', email).is('deleted_at', null).limit(1).maybeSingle()
        if (error) fail('users.getByEmail', error)
        return data ? toUser(data as Row) : null
      },
      async markDeleted(clerkUserId, at = new Date()) {
        const { error } = await db.from('users').update({ deleted_at: at.toISOString() }).eq('clerk_user_id', clerkUserId)
        if (error) fail('users.markDeleted', error)
      },
      async listToPurge(before, limit) {
        const { data, error } = await db
          .from('users')
          .select()
          .not('deleted_at', 'is', null)
          .lt('deleted_at', before.toISOString())
          .is('purged_at', null)
          .order('deleted_at')
          .limit(limit)
        if (error) fail('users.listToPurge', error)
        return (data as Row[]).map(toUser)
      },
      async markPurged(clerkUserId, at) {
        const { error } = await db.from('users').update({ purged_at: at.toISOString(), updated_at: at.toISOString() }).eq('clerk_user_id', clerkUserId)
        if (error) fail('users.markPurged', error)
      },
      async listDigestCandidates(before, limit) {
        const { data, error } = await db
          .from('users')
          .select()
          .is('deleted_at', null)
          .not('email', 'is', null)
          .eq('digest_enabled', true)
          .or(`last_digest_at.is.null,last_digest_at.lt.${before.toISOString()}`)
          .order('last_digest_at', { ascending: true, nullsFirst: true })
          .order('created_at', { ascending: true })
          .limit(limit)
        if (error) fail('users.listDigestCandidates', error)
        return (data as Row[]).map(toUser)
      },
      async markWelcomeOfferUsed(clerkUserId, at) {
        const { error } = await db.from('users').update({ welcome_offer_used_at: at.toISOString() }).eq('clerk_user_id', clerkUserId)
        if (error) fail('users.markWelcomeOfferUsed', error)
      },
      async setDigest(clerkUserId, enabled) {
        const { error } = await db.from('users').update({ digest_enabled: enabled, updated_at: new Date().toISOString() }).eq('clerk_user_id', clerkUserId)
        if (error) fail('users.setDigest', error)
      },
      async markDigestSent(clerkUserId, at) {
        const { error } = await db.from('users').update({ last_digest_at: at.toISOString() }).eq('clerk_user_id', clerkUserId)
        if (error) fail('users.markDigestSent', error)
      },
      async setStripeCustomerId(clerkUserId, customerId) {
        const { error } = await db
          .from('users')
          .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
          .eq('clerk_user_id', clerkUserId)
        if (error) fail('users.setStripeCustomerId', error)
      },
      async list(query, limit) {
        let q = db.from('users').select().is('deleted_at', null).order('created_at', { ascending: false }).limit(limit)
        // `%` et `_` sont des jokers pour ilike : échappés, pour qu'un email avec un souligné se
        // trouve encore. `*` (joker PostgREST) et la virgule (séparateur de filtre) sont retirés.
        if (query) q = q.ilike('email', `%${query.replace(/[*,]/g, '').replace(/[%_]/g, '\\$&')}%`)
        const { data, error } = await q
        if (error) fail('users.list', error)
        return (data as Row[]).map(toUser)
      },
      async setTester(clerkUserId, enabled) {
        const { error } = await db.from('users').update({ tester: enabled, updated_at: new Date().toISOString() }).eq('clerk_user_id', clerkUserId)
        if (error) fail('users.setTester', error)
      },
      async setCreator(clerkUserId, enabled) {
        const { error } = await db.from('users').update({ creator: enabled, updated_at: new Date().toISOString() }).eq('clerk_user_id', clerkUserId)
        if (error) fail('users.setCreator', error)
      },
      async resetQuota(clerkUserId, at) {
        const { error } = await db.from('users').update({ quota_reset_at: at.toISOString(), updated_at: at.toISOString() }).eq('clerk_user_id', clerkUserId)
        if (error) fail('users.resetQuota', error)
      },
      async eraseContent(clerkUserId) {
        for (const table of ['profiles', 'memory_notes', 'conversations', 'artifacts', 'push_subscriptions', 'reports', 'tasks', 'checkins', 'ad_rewards']) {
          const { error } = await db.from(table).delete().eq('user_id', clerkUserId)
          if (error) fail(`users.eraseContent.${table}`, error)
        }
        // Les abonnements Stripe restent : ils portent la comptabilité, et sont résiliés à part.
        const { error } = await db.from('subscriptions').delete().eq('user_id', clerkUserId).is('stripe_subscription_id', null)
        if (error) fail('users.eraseContent.subscriptions', error)
      },
      async anonymize(clerkUserId) {
        const now = new Date().toISOString()
        const { error } = await db
          .from('users')
          .update({ email: null, locale: 'en', digest_enabled: false, tester: false, stripe_customer_id: null, updated_at: now })
          .eq('clerk_user_id', clerkUserId)
        if (error) fail('users.anonymize', error)
        // La date de suppression d'origine reste : c'est elle qui fait courir le délai de purge.
        const marked = await db.from('users').update({ deleted_at: now }).eq('clerk_user_id', clerkUserId).is('deleted_at', null)
        if (marked.error) fail('users.anonymize.deleted', marked.error)
      },
      async exportAll(clerkUserId) {
        const user = await repo.users.get(clerkUserId)
        if (!user) return null
        const [profiles, notes, conversations, artifacts, subscriptions, reports, events] = await Promise.all([
          db.from('profiles').select().eq('user_id', clerkUserId),
          db.from('memory_notes').select().eq('user_id', clerkUserId).order('created_at'),
          db.from('conversations').select().eq('user_id', clerkUserId).order('created_at'),
          db.from('artifacts').select().eq('user_id', clerkUserId).order('created_at'),
          db.from('subscriptions').select('user_id, app_slug, status, current_period_end').eq('user_id', clerkUserId),
          repo.reports.listForUser(clerkUserId, 1000),
          repo.events.listForUser(clerkUserId, 5000),
        ])
        for (const r of [profiles, notes, conversations, artifacts, subscriptions]) if (r.error) fail('users.exportAll', r.error)
        const convs = (conversations.data as Row[]).map(toConversation)
        const withMessages = await Promise.all(
          convs.map(async (conversation) => ({ conversation, messages: await repo.messages.list(conversation.id, clerkUserId, 5000) }))
        )
        return {
          user,
          profiles: (profiles.data as Row[]).map(toProfile),
          notes: (notes.data as Row[]).map(toNote),
          conversations: withMessages,
          artifacts: (artifacts.data as Row[]).map(toArtifact),
          subscriptions: (subscriptions.data as Row[]).map(toSubscription),
          reports,
          events,
        }
      },
    },
    profiles: {
      async get(userId, appSlug) {
        const { data, error } = await db.from('profiles').select().eq('user_id', userId).eq('app_slug', appSlug).maybeSingle()
        if (error) fail('profiles.get', error)
        return data ? toProfile(data as Row) : null
      },
      async upsert(userId, appSlug, data, status) {
        const { data: row, error } = await db
          .from('profiles')
          .upsert({ user_id: userId, app_slug: appSlug, data, status, updated_at: new Date().toISOString() }, { onConflict: 'user_id,app_slug' })
          .select()
          .single()
        if (error) fail('profiles.upsert', error)
        return toProfile(row as Row)
      },
      async patch(userId, appSlug, patch) {
        const current = await this.get(userId, appSlug)
        const merged = { ...(current?.data ?? {}), ...patch }
        return this.upsert(userId, appSlug, merged, current?.status ?? 'onboarding')
      },
      async removeKey(userId, appSlug, k) {
        const current = await this.get(userId, appSlug)
        if (!current) return null
        const data = { ...current.data }
        delete data[k]
        return this.upsert(userId, appSlug, data, current.status)
      },
    },
    notes: {
      async list(userId, appSlug, limit) {
        const { data, error } = await db
          .from('memory_notes')
          .select()
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) fail('notes.list', error)
        return (data as Row[]).map(toNote)
      },
      async listSince(userId, appSlug, since, limit) {
        const { data, error } = await db
          .from('memory_notes')
          .select()
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) fail('notes.listSince', error)
        return (data as Row[]).map(toNote)
      },
      async countSince(userId, appSlug, since) {
        const { count, error } = await db
          .from('memory_notes')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .gte('created_at', since.toISOString())
        if (error) fail('notes.countSince', error)
        return count ?? 0
      },
      async add(userId, appSlug, content, source = 'ai') {
        const { data, error } = await db.from('memory_notes').insert({ user_id: userId, app_slug: appSlug, content, source }).select().single()
        if (error) fail('notes.add', error)
        return toNote(data as Row)
      },
      async update(id, userId, content) {
        const { data, error } = await db
          .from('memory_notes')
          .update({ content, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .maybeSingle()
        if (error) fail('notes.update', error)
        return data ? toNote(data as Row) : null
      },
      async remove(id, userId) {
        const { data, error } = await db.from('memory_notes').delete().eq('id', id).eq('user_id', userId).select('id')
        if (error) fail('notes.remove', error)
        return (data?.length ?? 0) > 0
      },
    },
    conversations: {
      async create(userId, appSlug, title) {
        const { data, error } = await db.from('conversations').insert({ user_id: userId, app_slug: appSlug, title }).select().single()
        if (error) fail('conversations.create', error)
        return toConversation(data as Row)
      },
      async get(id, userId, appSlug) {
        const { data, error } = await db.from('conversations').select().eq('id', id).eq('user_id', userId).eq('app_slug', appSlug).maybeSingle()
        if (error) fail('conversations.get', error)
        return data ? toConversation(data as Row) : null
      },
      async latest(userId, appSlug) {
        const { data, error } = await db
          .from('conversations')
          .select()
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) fail('conversations.latest', error)
        return data ? toConversation(data as Row) : null
      },
      async list(userId, appSlug, limit) {
        const { data, error } = await db
          .from('conversations')
          .select()
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .order('pinned', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(limit)
        if (error) fail('conversations.list', error)
        return (data as Row[]).map(toConversation)
      },
      async touch(id, userId, title) {
        const patch: Row = { updated_at: new Date().toISOString() }
        if (title) patch.title = title
        const { error } = await db.from('conversations').update(patch).eq('id', id).eq('user_id', userId)
        if (error) fail('conversations.touch', error)
      },
      async setPinned(id, userId, pinned) {
        const { data, error } = await db.from('conversations').update({ pinned }).eq('id', id).eq('user_id', userId).select('id')
        if (error) fail('conversations.setPinned', error)
        return (data?.length ?? 0) > 0
      },
    },
    messages: {
      async list(conversationId, userId, limit) {
        // Les `limit` messages les plus récents (tri décroissant puis inversion), jamais les plus anciens :
        // c'est la fenêtre d'historique du modèle et l'affichage de la conversation.
        const { data, error } = await db
          .from('messages')
          .select()
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(limit)
        if (error) fail('messages.list', error)
        return (data as Row[]).map(toMessage).reverse()
      },
      async append(input) {
        // Insertion stricte : un identifiant déjà pris est une erreur, jamais un écrasement.
        const { data, error } = await db
          .from('messages')
          .insert({
            id: input.id,
            conversation_id: input.conversationId,
            user_id: input.userId,
            app_slug: input.appSlug,
            role: input.role,
            parts: input.parts,
            generic: input.generic ?? null,
          })
          .select()
          .single()
        if (error) fail('messages.append', error)
        return toMessage(data as Row)
      },
      async setFeedback(messageId, userId, feedback, reason = null) {
        const { data, error } = await db
          .from('messages')
          .update({ feedback, feedback_reason: reason })
          .eq('id', messageId)
          .eq('user_id', userId)
          .eq('role', 'assistant')
          .select('id')
        if (error) fail('messages.setFeedback', error)
        return (data?.length ?? 0) > 0
      },
      async find(messageId, userId) {
        const { data, error } = await db.from('messages').select().eq('id', messageId).eq('user_id', userId).maybeSingle()
        if (error) fail('messages.find', error)
        return data ? toMessage(data as Row) : null
      },
    },
    artifacts: {
      async create(input) {
        const { data, error } = await db
          .from('artifacts')
          .insert({
            user_id: input.userId,
            app_slug: input.appSlug,
            conversation_id: input.conversationId ?? null,
            type: input.type,
            title: input.title,
            data: input.data,
          })
          .select()
          .single()
        if (error) fail('artifacts.create', error)
        return toArtifact(data as Row)
      },
      async get(id, userId) {
        const { data, error } = await db.from('artifacts').select().eq('id', id).eq('user_id', userId).maybeSingle()
        if (error) fail('artifacts.get', error)
        return data ? toArtifact(data as Row) : null
      },
      async list(userId, appSlug, limit) {
        const { data, error } = await db
          .from('artifacts')
          .select()
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) fail('artifacts.list', error)
        return (data as Row[]).map(toArtifact)
      },
      async listSince(userId, appSlug, since, limit) {
        const { data, error } = await db
          .from('artifacts')
          .select()
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) fail('artifacts.listSince', error)
        return (data as Row[]).map(toArtifact)
      },
      async countSince(userId, appSlug, since) {
        const { count, error } = await db
          .from('artifacts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .gte('created_at', since.toISOString())
        if (error) fail('artifacts.countSince', error)
        return count ?? 0
      },
    },
    events: {
      async track(event) {
        const { error } = await db.from('events').insert({
          user_id: event.userId ?? null,
          app_slug: event.appSlug ?? null,
          name: event.name,
          props: event.props ?? {},
          utm: event.utm ?? null,
        })
        if (error) console.error('[events.track]', error.message)
      },
      async listRefOnboardings() {
        const { data, error } = await db.from('events').select('user_id, utm, created_at, app_slug').eq('name', 'onboarding_done').not('utm->>ref', 'is', null).not('user_id', 'is', null).order('created_at').limit(20_000)
        if (error) fail('events.listRefOnboardings', error)
        return (data as Row[]).map((r) => ({ userId: str(r.user_id), ref: str((r.utm as Record<string, string>).ref), createdAt: str(r.created_at), appSlug: (r.app_slug as string | null) ?? null }))
      },
      async firstPaidAt(userIds) {
        const out = new Map<string, string>()
        if (!userIds.length) return out
        const { data, error } = await db.from('events').select('user_id, created_at, props').eq('name', 'subscribed').in('user_id', userIds).order('created_at').limit(20_000)
        if (error) fail('events.firstPaidAt', error)
        for (const r of data as Row[]) {
          const props = (r.props ?? {}) as Record<string, unknown>
          if (!props.subscriptionId) continue
          const id = str(r.user_id)
          if (!out.has(id)) out.set(id, str(r.created_at))
        }
        return out
      },
      async listPayments(userIds) {
        if (!userIds.length) return []
        const { data, error } = await db.from('events').select('user_id, created_at, props, app_slug').eq('name', 'payment').in('user_id', userIds).order('created_at').limit(50_000)
        if (error) fail('events.listPayments', error)
        return (data as Row[]).map(toPayment)
      },
      async listPaymentsForApp(appSlug) {
        const { data, error } = await db.from('events').select('user_id, created_at, props, app_slug').eq('name', 'payment').eq('app_slug', appSlug).not('user_id', 'is', null).order('created_at').limit(50_000)
        if (error) fail('events.listPaymentsForApp', error)
        return (data as Row[]).map(toPayment)
      },
      async listForUser(userId, limit) {
        const { data, error } = await db
          .from('events')
          .select('id, name, app_slug, props, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) fail('events.listForUser', error)
        return (data as Row[]).map(toEvent)
      },
    },
    studioWaitlist: {
      async add(input) {
        const { error } = await db.from('studio_waitlist').insert({ email: input.email, idea: input.idea, audience: input.audience, locale: input.locale, utm: input.utm })
        if (error) {
          if ((error as { code?: string }).code === '23505') return 'exists'
          fail('studioWaitlist.add', error)
        }
        return 'added'
      },
      async count() {
        const { count, error } = await db.from('studio_waitlist').select('id', { count: 'exact', head: true })
        if (error) fail('studioWaitlist.count', error)
        return count ?? 0
      },
      async list(limit) {
        const { data, error } = await db.from('studio_waitlist').select().order('created_at', { ascending: false }).limit(limit)
        if (error) fail('studioWaitlist.list', error)
        return (data as Row[]).map((r) => ({ id: str(r.id), email: str(r.email), idea: str(r.idea), audience: (r.audience as string | null) ?? null, locale: str(r.locale), utm: (r.utm as Record<string, string> | null) ?? null, createdAt: str(r.created_at) }))
      },
    },
    affiliates: {
      async list() {
        const { data, error } = await db.from('affiliates').select().order('created_at')
        if (error) fail('affiliates.list', error)
        return (data as Row[]).map(toAffiliate)
      },
      async create(input) {
        const { data, error } = await db.from('affiliates').insert({ code: input.code, name: input.name, contact: input.contact, payout_eur: input.payoutEur, percent: input.percent, months: input.months, app_slug: input.appSlug }).select().single()
        if (error) fail('affiliates.create', error)
        return toAffiliate(data as Row)
      },
      async remove(code) {
        const { error } = await db.from('affiliates').delete().eq('code', code)
        if (error) fail('affiliates.remove', error)
      },
    },
    usage: {
      async record(u) {
        const { error } = await db.from('usage').insert({
          user_id: u.userId,
          app_slug: u.appSlug,
          conversation_id: u.conversationId ?? null,
          provider: u.provider,
          model: u.model,
          input_tokens: u.inputTokens,
          output_tokens: u.outputTokens,
          cost_usd: u.costUsd,
          duration_ms: u.durationMs,
        })
        if (error) fail('usage.record', error)
      },
      async countMessagesToday(userId, appSlug, now) {
        const { count, error } = await db
          .from('usage')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .gte('created_at', startOfUtcDay(now).toISOString())
        if (error) fail('usage.countMessagesToday', error)
        return count ?? 0
      },
      async costTodayUsd(userId, appSlug, now) {
        const { data, error } = await db
          .from('usage')
          .select('cost_usd')
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .gte('created_at', startOfUtcDay(now).toISOString())
        if (error) fail('usage.costTodayUsd', error)
        return (data as Row[]).reduce((s, r) => s + num(r.cost_usd), 0)
      },
      async costMonthUsd(userId, appSlug, now) {
        return this.costSince(userId, appSlug, startOfUtcMonth(now))
      },
      async costSince(userId, appSlug, since) {
        const { data, error } = await db
          .from('usage')
          .select('cost_usd')
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .gte('created_at', since.toISOString())
        if (error) fail('usage.costSince', error)
        return (data as Row[]).reduce((s, r) => s + num(r.cost_usd), 0)
      },
      async countMessagesSince(userId, appSlug, since) {
        const { count, error } = await db
          .from('usage')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .gte('created_at', since.toISOString())
        if (error) fail('usage.countMessagesSince', error)
        return count ?? 0
      },
      async activeDays(userId, appSlug, since) {
        const { data, error } = await db
          .from('usage')
          .select('created_at')
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .gte('created_at', since.toISOString())
        if (error) fail('usage.activeDays', error)
        return new Set((data as Row[]).map((r) => str(r.created_at).slice(0, 10))).size
      },
      async lastMessageAt(userId, appSlug) {
        const { data, error } = await db
          .from('usage')
          .select('created_at')
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) fail('usage.lastMessageAt', error)
        const row = (data as Row[])[0]
        return row ? new Date(str(row.created_at)) : null
      },
    },
    appSettings: {
      async list() {
        // Les réglages changent quelques fois par mois et sont lus à chaque page et à chaque
        // message : un cache court par instance, invalidé à l'écriture (même instance) et
        // expiré au bout d'une minute (autres instances).
        if (settingsCache && settingsCache.until > Date.now()) return settingsCache.value
        const { data, error } = await db.from('app_settings').select('scope, key, value').order('updated_at', { ascending: true })
        if (error) fail('appSettings.list', error)
        const out: AppSetting[] = []
        for (const r of data as Row[]) {
          const scope = Array.isArray(r.scope) && (r.scope as string[]).includes('all') ? 'all' : (r.scope as string[])
          const parsed = appSettingSchema.safeParse({ scope, key: r.key, value: r.value })
          if (parsed.success) out.push(parsed.data)
        }
        settingsCache = { value: out, until: Date.now() + SETTINGS_TTL_MS }
        return out
      },
      async upsert(setting, by) {
        settingsCache = null
        const scope = setting.scope === 'all' ? ['all'] : setting.scope
        // Pas de contrainte d'unicité sur (scope, key) en base : on remplace à la main.
        const { error: delError } = await db.from('app_settings').delete().eq('key', setting.key).contains('scope', scope).containedBy('scope', scope)
        if (delError) fail('appSettings.upsert', delError)
        const { error } = await db.from('app_settings').insert({ scope, key: setting.key, value: setting.value, updated_by: by, updated_at: new Date().toISOString() })
        if (error) fail('appSettings.upsert', error)
      },
      async remove(scope, key) {
        settingsCache = null
        const arr = scope === 'all' ? ['all'] : scope
        const { error } = await db.from('app_settings').delete().eq('key', key).contains('scope', arr).containedBy('scope', arr)
        if (error) fail('appSettings.remove', error)
      },
    },
    visits: {
      async record(input) {
        // Une même personne, un même jour, un même chemin : une seule ligne. Le doublon est
        // ignoré, pas une erreur : rien ne doit ralentir l'affichage du hub.
        const { error } = await db.from('visits').upsert(
          { day: input.day, path: input.path, utm: input.utm, visitor_hash: input.visitorHash },
          { onConflict: 'day,path,visitor_hash', ignoreDuplicates: true }
        )
        if (error) console.error('[visits.record]', error.message)
      },
    },
    subscriptions: {
      async listActive(userId) {
        const { data, error } = await db
          .from('subscriptions')
          .select('user_id, app_slug, status, current_period_end')
          .eq('user_id', userId)
          .in('status', ['active', 'trialing', 'past_due'])
        if (error) fail('subscriptions.listActive', error)
        return (data as Row[]).map(toSubscription)
      },
      async startTrial(userId, appSlug, endsAt) {
        // Une seule semaine d'accueil par personne et par IA, quel que soit le statut passé.
        const { count, error: countError } = await db
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
        if (countError) fail('subscriptions.startTrial', countError)
        if ((count ?? 0) > 0) return false
        const { error } = await db
          .from('subscriptions')
          .insert({ user_id: userId, app_slug: appSlug, status: 'trialing', current_period_end: endsAt.toISOString() })
        if (error) fail('subscriptions.startTrial', error)
        return true
      },
      async upsertFromStripe(input) {
        // Clé de conflit : l'identifiant d'abonnement Stripe. Un événement rejoué met à jour la même ligne.
        const { error } = await db.from('subscriptions').upsert(
          {
            user_id: input.userId,
            app_slug: input.appSlug,
            stripe_customer_id: input.stripeCustomerId,
            stripe_subscription_id: input.stripeSubscriptionId,
            stripe_price_id: input.stripePriceId,
            status: input.status,
            current_period_end: input.currentPeriodEnd,
            interval: input.interval,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'stripe_subscription_id' }
        )
        if (error) fail('subscriptions.upsertFromStripe', error)
      },
      async upsertFromWhop(input) {
        const { error } = await db.from('subscriptions').upsert(
          {
            user_id: input.userId,
            app_slug: input.appSlug,
            whop_membership_id: input.whopMembershipId,
            status: input.status,
            current_period_end: input.currentPeriodEnd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'whop_membership_id' }
        )
        if (error) fail('subscriptions.upsertFromWhop', error)
      },
      async hasWhop(userId) {
        const { count, error } = await db
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .not('whop_membership_id', 'is', null)
          .in('status', ['active', 'trialing', 'past_due'])
        if (error) fail('subscriptions.hasWhop', error)
        return (count ?? 0) > 0
      },
      async extendTrial(userId, appSlug, days, now) {
        const { data, error } = await db
          .from('subscriptions')
          .select('id, current_period_end')
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .eq('status', 'trialing')
          .is('stripe_subscription_id', null)
          .maybeSingle()
        if (error) fail('subscriptions.extendTrial', error)
        if (!data) return false
        // Depuis la fin actuelle si elle est à venir, depuis maintenant si elle est passée :
        // prolonger une semaine finie depuis un mois ne doit pas rendre un mois.
        const current = new Date(str((data as Row).current_period_end))
        const base = current.getTime() > now.getTime() ? current : now
        const end = new Date(base.getTime() + days * 86_400_000).toISOString()
        const { error: updateError } = await db.from('subscriptions').update({ current_period_end: end, updated_at: now.toISOString() }).eq('id', str((data as Row).id))
        if (updateError) fail('subscriptions.extendTrial', updateError)
        return true
      },
      async listStripeIds(userId) {
        const { data, error } = await db
          .from('subscriptions')
          .select('stripe_subscription_id')
          .eq('user_id', userId)
          .not('stripe_subscription_id', 'is', null)
          .in('status', ['active', 'trialing', 'past_due'])
        if (error) fail('subscriptions.listStripeIds', error)
        return (data as Row[]).map((r) => str(r.stripe_subscription_id))
      },
      async gift(userId, appSlug, days, now) {
        const { data, error } = await db
          .from('subscriptions')
          .select('id, current_period_end')
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .eq('status', 'active')
          .is('stripe_subscription_id', null)
          .maybeSingle()
        if (error) fail('subscriptions.gift', error)
        if (data) {
          const current = new Date(str((data as Row).current_period_end))
          const base = current.getTime() > now.getTime() ? current : now
          const end = new Date(base.getTime() + days * 86_400_000).toISOString()
          const { error: updateError } = await db.from('subscriptions').update({ current_period_end: end, updated_at: now.toISOString() }).eq('id', str((data as Row).id))
          if (updateError) fail('subscriptions.gift', updateError)
          return
        }
        const end = new Date(now.getTime() + days * 86_400_000).toISOString()
        const { error: insertError } = await db.from('subscriptions').insert({ user_id: userId, app_slug: appSlug, status: 'active', current_period_end: end })
        // Deux clics simultanés : le second trouve la ligne du premier et la prolonge.
        if (insertError && (insertError as { code?: string }).code === '23505') return repo.subscriptions.gift(userId, appSlug, days, now)
        if (insertError) fail('subscriptions.gift', insertError)
      },
    },
    push: {
      async save(input) {
        // Clé de conflit : le couple navigateur et IA. Un navigateur qui se réabonne
        // (clés renouvelées) met à jour sa ligne au lieu d'en créer une seconde.
        const { error } = await db.from('push_subscriptions').upsert(
          {
            user_id: input.userId,
            app_slug: input.appSlug,
            endpoint: input.endpoint,
            p256dh: input.p256dh,
            auth: input.auth,
            locale: input.locale,
            last_nudged_at: null,
          },
          { onConflict: 'endpoint,app_slug' }
        )
        if (error) fail('push.save', error)
      },
      async remove(userId, appSlug, endpoint) {
        // Le filtre sur `user_id` empêche de désabonner le navigateur de quelqu'un d'autre
        // en devinant son endpoint.
        const { data, error } = await db
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .eq('endpoint', endpoint)
          .select('id')
        if (error) fail('push.remove', error)
        return (data as Row[]).length > 0
      },
      async removeExpired(endpoint) {
        const { error } = await db.from('push_subscriptions').delete().eq('endpoint', endpoint)
        if (error) fail('push.removeExpired', error)
      },
      async countForApp(userId, appSlug) {
        const { count, error } = await db
          .from('push_subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
        if (error) fail('push.countForApp', error)
        return count ?? 0
      },
      async listDue(before, limit) {
        // Jamais servis d'abord, puis les plus anciennement servis : le lot tourne au lieu
        // de relancer toujours les mêmes.
        const { data, error } = await db
          .from('push_subscriptions')
          .select('id, user_id, app_slug, endpoint, p256dh, auth, locale, last_nudged_at')
          .or(`last_nudged_at.is.null,last_nudged_at.lt.${before.toISOString()}`)
          .order('last_nudged_at', { ascending: true, nullsFirst: true })
          .limit(limit)
        if (error) fail('push.listDue', error)
        return (data as Row[]).map(toPushSubscription)
      },
      async markNudged(id, at) {
        const { error } = await db.from('push_subscriptions').update({ last_nudged_at: at.toISOString() }).eq('id', id)
        if (error) fail('push.markNudged', error)
      },
      async listForApp(appSlug) {
        const { data, error } = await db
          .from('push_subscriptions')
          .select('id, user_id, app_slug, endpoint, p256dh, auth, locale, last_nudged_at')
          .eq('app_slug', appSlug)
        if (error) fail('push.listForApp', error)
        return (data as Row[]).map(toPushSubscription)
      },
      async listForUserApp(userId, appSlug) {
        const { data, error } = await db.from('push_subscriptions').select().eq('user_id', userId).eq('app_slug', appSlug)
        if (error) fail('push.listForUserApp', error)
        return (data as Row[]).map(toPushSubscription)
      },
    },
    tasks: {
      async createMany(inputs) {
        if (inputs.length === 0) return []
        const rows = inputs.map((i) => ({
          user_id: i.userId,
          app_slug: i.appSlug,
          conversation_id: i.conversationId,
          title: i.title,
          first_action: i.firstAction,
          steps: i.steps ?? [],
          energy: i.energy,
          estimate_min: i.estimateMin,
        }))
        const { data, error } = await db.from('tasks').insert(rows).select()
        if (error) fail('tasks.createMany', error)
        return (data as Row[]).map(toTask)
      },
      async get(id, userId, appSlug) {
        const { data, error } = await db.from('tasks').select().eq('id', id).eq('user_id', userId).eq('app_slug', appSlug).maybeSingle()
        if (error) fail('tasks.get', error)
        return data ? toTask(data as Row) : null
      },
      async listOpen(userId, appSlug, limit) {
        const { data, error } = await db
          .from('tasks')
          .select()
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .in('status', ['open', 'deferred'])
          .order('created_at', { ascending: true })
          .limit(limit)
        if (error) fail('tasks.listOpen', error)
        return (data as Row[]).map(toTask)
      },
      async listAll(userId, appSlug, limit) {
        const { data, error } = await db.from('tasks').select().eq('user_id', userId).eq('app_slug', appSlug).order('created_at', { ascending: false }).limit(limit)
        if (error) fail('tasks.listAll', error)
        return (data as Row[]).map(toTask)
      },
      async findByTitle(userId, appSlug, title) {
        const { data, error } = await db
          .from('tasks')
          .select()
          .eq('user_id', userId)
          .eq('app_slug', appSlug)
          .neq('status', 'dropped')
          // Titre exact, insensible à la casse : jokers d'ilike échappés, et virgules retirées
          // (PostgREST les lit comme un séparateur de filtre).
          .ilike('title', title.trim().replace(/[*,]/g, '').replace(/[%_]/g, '\\$&'))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) fail('tasks.findByTitle', error)
        return data ? toTask(data as Row) : null
      },
      async update(id, userId, patch) {
        const row: Row = { updated_at: new Date().toISOString() }
        if (patch.title !== undefined) row.title = patch.title
        if (patch.firstAction !== undefined) row.first_action = patch.firstAction
        if (patch.steps !== undefined) row.steps = patch.steps
        if (patch.energy !== undefined) row.energy = patch.energy
        if (patch.estimateMin !== undefined) row.estimate_min = patch.estimateMin
        if (patch.actualMin !== undefined) row.actual_min = patch.actualMin
        if (patch.status !== undefined) {
          row.status = patch.status
          if (patch.status === 'done') row.done_at = new Date().toISOString()
        }
        const { data, error } = await db.from('tasks').update(row).eq('id', id).eq('user_id', userId).select().maybeSingle()
        if (error) fail('tasks.update', error)
        return data ? toTask(data as Row) : null
      },
      async timeStats(userId, appSlug) {
        const { data, error } = await db.from('tasks').select('estimate_min, actual_min').eq('user_id', userId).eq('app_slug', appSlug).eq('status', 'done').limit(500)
        if (error) fail('tasks.timeStats', error)
        const rows = data as Row[]
        const measured = rows.filter((r) => typeof r.estimate_min === 'number' && typeof r.actual_min === 'number')
        const est = measured.reduce((a, r) => a + num(r.estimate_min), 0)
        const act = measured.reduce((a, r) => a + num(r.actual_min), 0)
        return { finished: rows.length, measured: measured.length, ratio: est > 0 ? act / est : null }
      },
    },
    checkins: {
      async create(input) {
        const { data, error } = await db
          .from('checkins')
          .insert({
            user_id: input.userId,
            app_slug: input.appSlug,
            kind: input.kind,
            time_local: input.timeLocal,
            timezone: input.timezone,
            days: input.days,
            message: input.message,
            prompt: input.prompt,
            next_run_at: input.nextRunAt,
          })
          .select()
          .single()
        if (error) fail('checkins.create', error)
        return toCheckin(data as Row)
      },
      async list(userId, appSlug) {
        const { data, error } = await db.from('checkins').select().eq('user_id', userId).eq('app_slug', appSlug).order('created_at')
        if (error) fail('checkins.list', error)
        return (data as Row[]).map(toCheckin)
      },
      async get(id, userId, appSlug) {
        const { data, error } = await db.from('checkins').select().eq('id', id).eq('user_id', userId).eq('app_slug', appSlug).maybeSingle()
        if (error) fail('checkins.get', error)
        return data ? toCheckin(data as Row) : null
      },
      async listDue(before, limit) {
        const { data, error } = await db.from('checkins').select().eq('active', true).lte('next_run_at', before.toISOString()).order('next_run_at').limit(limit)
        if (error) fail('checkins.listDue', error)
        return (data as Row[]).map(toCheckin)
      },
      async advance(id, nextRunAt, sentAt) {
        const row: Row = { last_sent_at: sentAt.toISOString() }
        if (nextRunAt) row.next_run_at = nextRunAt.toISOString()
        else row.active = false
        const { error } = await db.from('checkins').update(row).eq('id', id)
        if (error) fail('checkins.advance', error)
      },
      async setActive(id, userId, active) {
        const { data, error } = await db.from('checkins').update({ active }).eq('id', id).eq('user_id', userId).select('id')
        if (error) fail('checkins.setActive', error)
        return (data?.length ?? 0) > 0
      },
      async remove(id, userId) {
        const { data, error } = await db.from('checkins').delete().eq('id', id).eq('user_id', userId).select('id')
        if (error) fail('checkins.remove', error)
        return (data?.length ?? 0) > 0
      },
    },
    rewards: {
      async start(input) {
        const { data, error } = await db.from('ad_rewards').insert({ user_id: input.userId, app_slug: input.appSlug, day: input.day, nonce: input.nonce, messages: input.messages }).select().single()
        if (error) fail('rewards.start', error)
        return toReward(data as Row)
      },
      async grant(nonce, userId, at, maxAgeMs) {
        const since = new Date(at.getTime() - maxAgeMs).toISOString()
        const { data, error } = await db
          .from('ad_rewards')
          .update({ status: 'granted', granted_at: at.toISOString() })
          .eq('nonce', nonce)
          .eq('user_id', userId)
          .eq('status', 'pending')
          .gte('created_at', since)
          .select()
        if (error) fail('rewards.grant', error)
        const row = (data as Row[] | null)?.[0]
        return row ? toReward(row) : null
      },
      async today(userId, appSlug, day) {
        const { data, error } = await db.from('ad_rewards').select('messages').eq('user_id', userId).eq('app_slug', appSlug).eq('day', day).eq('status', 'granted')
        if (error) fail('rewards.today', error)
        const rows = (data as Row[]) ?? []
        return { videos: rows.length, messages: rows.reduce((s, r) => s + num(r.messages), 0) }
      },
    },
    reports: {
      async create(input) {
        const { data, error } = await db
          .from('reports')
          .insert({
            user_id: input.userId ?? null,
            app_slug: input.appSlug ?? null,
            conversation_id: input.conversationId ?? null,
            message_id: input.messageId ?? null,
            source: input.source,
            category: input.category,
            severity: input.severity,
            rating: input.rating ?? null,
            body: input.body ?? null,
          })
          .select()
          .single()
        if (error) fail('reports.create', error)
        return toReport(data as Row)
      },
      async get(id) {
        const { data, error } = await db.from('reports').select().eq('id', id).maybeSingle()
        if (error) fail('reports.get', error)
        return data ? toReport(data as Row) : null
      },
      async list({ status, limit }) {
        // Les plus graves d'abord, puis les plus récents. Une requête par gravité, chacune
        // bornée : trier après la limite laisserait tomber un signalement grave mais ancien.
        const pages = await Promise.all(
          (['high', 'medium', 'low'] as const).map(async (severity) => {
            let q = db.from('reports').select().eq('severity', severity).order('created_at', { ascending: false }).limit(limit)
            if (status) q = q.eq('status', status)
            const { data, error } = await q
            if (error) fail('reports.list', error)
            return (data as Row[]).map(toReport)
          })
        )
        return pages.flat().slice(0, limit)
      },
      async listForUser(userId, limit) {
        const { data, error } = await db.from('reports').select().eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)
        if (error) fail('reports.listForUser', error)
        return (data as Row[]).map(toReport)
      },
      async setStatus(id, status, resolution, by) {
        const now = new Date().toISOString()
        const patch: Row = { status, updated_at: now }
        if (status === 'resolved') {
          patch.resolution = resolution
          patch.resolved_by = by
          patch.resolved_at = now
        }
        const { data, error } = await db.from('reports').update(patch).eq('id', id).select().maybeSingle()
        if (error) fail('reports.setStatus', error)
        return data ? toReport(data as Row) : null
      },
      async countNew() {
        const { count, error } = await db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'new')
        if (error) fail('reports.countNew', error)
        return count ?? 0
      },
    },
    admin: {
      async overview() {
        const { data, error } = await db.from('admin_overview').select().single()
        if (error) fail('admin.overview', error)
        const r = data as Row
        return {
          usersTotal: num(r.users_total),
          signupsToday: num(r.signups_today),
          signupsWeek: num(r.signups_week),
          signupsMonth: num(r.signups_month),
          activeToday: num(r.active_today),
          activeWeek: num(r.active_week),
          activeMonth: num(r.active_month),
          messagesToday: num(r.messages_today),
          messagesWeek: num(r.messages_week),
          costTodayUsd: num(r.cost_today_usd),
          costMonthUsd: num(r.cost_month_usd),
          subscribers: num(r.subscribers),
          inTrial: num(r.in_trial),
          reportsNew: num(r.reports_new),
        } satisfies AdminOverview
      },
      async dailyActivity(days, appSlug) {
        const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
        let q = db.from('daily_activity').select().gte('day', since).order('day', { ascending: true })
        if (appSlug) q = q.eq('app_slug', appSlug)
        const { data, error } = await q
        if (error) fail('admin.dailyActivity', error)
        return (data as Row[]).map(
          (r): DailyActivity => ({
            day: str(r.day),
            appSlug: str(r.app_slug),
            activeUsers: num(r.active_users),
            messages: num(r.messages),
            costUsd: num(r.cost_usd),
            latencyP50Ms: num(r.latency_p50_ms),
            latencyP95Ms: num(r.latency_p95_ms),
          })
        )
      },
      async cohorts(appSlug) {
        const { data, error } = appSlug
          ? await db.from('app_cohorts').select().eq('app_slug', appSlug).order('week', { ascending: false }).limit(16)
          : await db.from('signup_cohorts').select().order('week', { ascending: false }).limit(16)
        if (error) fail('admin.cohorts', error)
        return (data as Row[]).map(toCohort)
      },
      async funnel(appSlug) {
        const query = db.from('funnel').select()
        const { data, error } = await (appSlug ? query.eq('app_slug', appSlug) : query)
        if (error) fail('admin.funnel', error)
        return (data as Row[]).map(
          (r): FunnelRow => ({
            appSlug: str(r.app_slug),
            started: num(r.started),
            onboarded: num(r.onboarded),
            firstMessage: num(r.first_message),
            threeMessages: num(r.three_messages),
            subscribed: num(r.subscribed),
          })
        )
      },
      async quality() {
        const { data, error } = await db.from('app_quality').select()
        if (error) fail('admin.quality', error)
        return (data as Row[]).map(
          (r): AppQuality => ({
            appSlug: str(r.app_slug),
            answers: num(r.answers),
            thumbsUp: num(r.thumbs_up),
            thumbsDown: num(r.thumbs_down),
            genericAnswers: num(r.generic_answers),
            toolCalled: num(r.tool_called),
            toolFailed: num(r.tool_failed),
            fallbacks: num(r.fallbacks),
            quotaHits: num(r.quota_hits),
            openReports: num(r.open_reports),
          })
        )
      },
      async conversationStats(userId, limit) {
        const { data, error } = await db.from('conversation_stats').select().eq('user_id', userId).order('updated_at', { ascending: false }).limit(limit)
        if (error) fail('admin.conversationStats', error)
        return (data as Row[]).map(
          (r): ConversationStats => ({
            conversationId: str(r.conversation_id),
            userId: str(r.user_id),
            appSlug: str(r.app_slug),
            title: str(r.title),
            createdAt: str(r.created_at),
            updatedAt: str(r.updated_at),
            messages: num(r.messages),
            thumbsUp: num(r.thumbs_up),
            thumbsDown: num(r.thumbs_down),
            genericAnswers: num(r.generic_answers),
          })
        )
      },
      async conversationStat(userId, conversationId) {
        const { data, error } = await db.from('conversation_stats').select().eq('user_id', userId).eq('conversation_id', conversationId).maybeSingle()
        if (error) fail('admin.conversationStat', error)
        if (!data) return null
        const r = data as Row
        return {
          conversationId: str(r.conversation_id),
          userId: str(r.user_id),
          appSlug: str(r.app_slug),
          title: str(r.title),
          createdAt: str(r.created_at),
          updatedAt: str(r.updated_at),
          messages: num(r.messages),
          thumbsUp: num(r.thumbs_up),
          thumbsDown: num(r.thumbs_down),
          genericAnswers: num(r.generic_answers),
        }
      },
      async launchedAt(appSlug) {
        const { data, error } = await db.from('profiles').select('created_at').eq('app_slug', appSlug).eq('status', 'active').order('created_at', { ascending: true }).limit(1)
        if (error) fail('admin.launchedAt', error)
        const row = (data as Row[])[0]
        return row ? new Date(str(row.created_at)) : null
      },
      async paidSubscriptions() {
        const { data, error } = await db.from('paid_subscriptions').select()
        if (error) fail('admin.paidSubscriptions', error)
        return (data as Row[]).map(
          (r): PaidSubscription => ({
            userId: str(r.user_id),
            appSlug: str(r.app_slug),
            interval: r.interval === 'year' ? 'year' : r.interval === 'month' ? 'month' : null,
            status: str(r.status),
          })
        )
      },
      async trialConversion() {
        const { data, error } = await db.from('trial_conversion').select().single()
        if (error) fail('admin.trialConversion', error)
        const r = data as Row
        return { trialsEnded: num(r.trials_ended), converted: num(r.converted) } satisfies TrialConversion
      },
      async welcomeConversion() {
        const { data, error } = await db.from('welcome_conversion').select().single()
        if (error) fail('admin.welcomeConversion', error)
        const r = data as Row
        return { signups30d: num(r.signups_30d), convertedInWindow: num(r.converted_in_window), convertedAny: num(r.converted_any), offerUsed: num(r.offer_used) } satisfies WelcomeConversion
      },
      async freeTierDays() {
        const { data, error } = await db.from('free_tier_day').select()
        if (error) fail('admin.freeTierDays', error)
        return (data as Row[]).map((r): FreeTierDay => ({ day: str(r.day), activeFree: num(r.active_free), costFreeUsd: num(r.cost_free_usd), limitHitUsers: num(r.limit_hit_users), videosGranted: num(r.videos_granted) }))
      },
      async peopleSpend(appSlug, order, limit) {
        let q = db.from('people_spend').select().order('cost_30d_usd', { ascending: order === 'asc' }).limit(limit)
        if (appSlug) q = q.eq('app_slug', appSlug)
        const { data, error } = await q
        if (error) fail('admin.peopleSpend', error)
        return (data as Row[]).map((r): PersonSpend => ({ userId: str(r.user_id), appSlug: str(r.app_slug), email: (r.email as string | null) ?? null, messages30d: num(r.messages_30d), costTodayUsd: num(r.cost_today_usd), cost30dUsd: num(r.cost_30d_usd), lastMessageAt: (r.last_message_at as string | null) ?? null, plan: r.plan as PersonSpend['plan'] }))
      },
      async churnMonth() {
        const { data, error } = await db.from('churn_month').select().single()
        if (error) fail('admin.churnMonth', error)
        const r = data as Row
        return { churned: num(r.churned), atMonthStart: num(r.at_month_start) } satisfies ChurnMonth
      },
      async attribution() {
        const { data, error } = await db.from('attribution').select().limit(50)
        if (error) fail('admin.attribution', error)
        return (data as Row[]).map((r): AttributionRow => ({ source: str(r.source), campaign: str(r.campaign), onboardings: num(r.onboardings) }))
      },
      async weeklyActive() {
        const { data, error } = await db.from('weekly_active').select()
        if (error) fail('admin.weeklyActive', error)
        return Object.fromEntries((data as Row[]).map((r) => [str(r.app_slug), num(r.active_users)]))
      },
      async dailyVisits(days) {
        const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
        const { data, error } = await db.from('daily_visits').select().gte('day', since).order('day', { ascending: true })
        if (error) fail('admin.dailyVisits', error)
        return (data as Row[]).map((r): DailyVisits => ({ day: str(r.day), visits: num(r.visits), visitors: num(r.visitors) }))
      },
    },
    whopMemberships: {
      async upsert(record) {
        const { error } = await db.from('whop_memberships').upsert(
          {
            membership_id: record.membershipId,
            whop_user_id: record.whopUserId,
            email: record.email,
            product_id: record.productId,
            plan_id: record.planId,
            status: record.status,
            renewal_period_end: record.renewalPeriodEnd,
            app_slug: record.appSlug,
            user_id: record.userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'membership_id' }
        )
        if (error) fail('whopMemberships.upsert', error)
      },
      async listPendingByEmail(email) {
        const { data, error } = await db.from('whop_memberships').select().is('user_id', null).ilike('email', email).in('status', ['active', 'trialing', 'past_due'])
        if (error) fail('whopMemberships.listPendingByEmail', error)
        return (data as Row[]).map((r) => ({
          membershipId: str(r.membership_id),
          whopUserId: (r.whop_user_id as string | null) ?? null,
          email: (r.email as string | null) ?? null,
          productId: (r.product_id as string | null) ?? null,
          planId: (r.plan_id as string | null) ?? null,
          status: str(r.status),
          renewalPeriodEnd: (r.renewal_period_end as string | null) ?? null,
          appSlug: str(r.app_slug),
          userId: (r.user_id as string | null) ?? null,
        }))
      },
      async attach(membershipId, userId) {
        const { error } = await db.from('whop_memberships').update({ user_id: userId, updated_at: new Date().toISOString() }).eq('membership_id', membershipId)
        if (error) fail('whopMemberships.attach', error)
      },
    },
    creatorApps: {
      async listPublished() {
        // En ligne = une version publiée existe et l'IA n'est pas suspendue : une resoumission en
        // revue ne retire pas la version en ligne, seule la suspension le fait.
        const { data, error } = await db.from('creator_apps').select().not('published_manifest', 'is', null).neq('status', 'suspended').order('published_at')
        if (error) fail('creatorApps.listPublished', error)
        return (data as Row[]).map(toCreatorApp)
      },
      async get(slug) {
        const { data, error } = await db.from('creator_apps').select().eq('slug', slug).maybeSingle()
        if (error) fail('creatorApps.get', error)
        return data ? toCreatorApp(data as Row) : null
      },
      async listByOwner(ownerId) {
        const { data, error } = await db.from('creator_apps').select().eq('owner_id', ownerId).order('created_at')
        if (error) fail('creatorApps.listByOwner', error)
        return (data as Row[]).map(toCreatorApp)
      },
      async saveDraft(input) {
        const now = new Date().toISOString()
        // Création par insert (la clé primaire refuse un slug pris, même en cas de course), mise à
        // jour filtrée par propriétaire : `owner_id` n'est jamais réécrit.
        const { data: updated, error: updateError } = await db
          .from('creator_apps')
          .update({ manifest: input.manifest, knowledge: input.knowledge, ...(input.requests ? { requests: input.requests } : {}), updated_at: now })
          .eq('slug', input.slug)
          .eq('owner_id', input.ownerId)
          .select()
          .maybeSingle()
        if (updateError) fail('creatorApps.saveDraft', updateError)
        if (updated) return toCreatorApp(updated as Row)
        const { data, error } = await db.from('creator_apps').insert({ slug: input.slug, owner_id: input.ownerId, manifest: input.manifest, knowledge: input.knowledge, requests: input.requests ?? {}, updated_at: now }).select().single()
        if (error) {
          if ((error as { code?: string }).code === '23505') throw new Error('slug_taken')
          fail('creatorApps.saveDraft', error)
        }
        return toCreatorApp(data as Row)
      },
      async setAssessments(slug, assessments) {
        const { data, error } = await db.from('creator_apps').select('manifest').eq('slug', slug).maybeSingle()
        if (error) fail('creatorApps.setAssessments', error)
        if (!data) throw new Error('not_found')
        const manifest = withAssessments((data as Row).manifest as CreatorApp['manifest'], assessments)
        const { error: updateError } = await db.from('creator_apps').update({ manifest, updated_at: new Date().toISOString() }).eq('slug', slug)
        if (updateError) fail('creatorApps.setAssessments', updateError)
      },
      async listByStatus(statuses) {
        const { data, error } = await db.from('creator_apps').select().in('status', statuses).order('submitted_at', { ascending: true, nullsFirst: false })
        if (error) fail('creatorApps.listByStatus', error)
        return (data as Row[]).map(toCreatorApp)
      },
      async publish(slug, reviewerId, input = {}) {
        const { data, error } = await db.from('creator_apps').select('manifest, knowledge, share_percent').eq('slug', slug).maybeSingle()
        if (error) fail('creatorApps.publish', error)
        if (!data) throw new Error('not_found')
        const row = data as Row
        const now = new Date().toISOString()
        const { error: updateError } = await db
          .from('creator_apps')
          .update({ status: 'published', published_manifest: row.manifest, published_knowledge: row.knowledge, reviewed_by: reviewerId, reviewed_at: now, review_notes: null, published_at: now, updated_at: now, share_percent: input.sharePercent ?? row.share_percent })
          .eq('slug', slug)
        if (updateError) fail('creatorApps.publish', updateError)
      },
      async requestChanges(slug, reviewerId, notes) {
        const { data, error } = await db.from('creator_apps').select('status').eq('slug', slug).maybeSingle()
        if (error) fail('creatorApps.requestChanges', error)
        if (!data) throw new Error('not_found')
        const now = new Date().toISOString()
        const status = str((data as Row).status) === 'published' ? 'published' : 'changes_requested'
        const { error: updateError } = await db.from('creator_apps').update({ status, reviewed_by: reviewerId, reviewed_at: now, review_notes: notes, updated_at: now }).eq('slug', slug)
        if (updateError) fail('creatorApps.requestChanges', updateError)
      },
      async suspend(slug, reviewerId, reason) {
        const now = new Date().toISOString()
        // Suspendre retire la version en ligne : une resoumission ne peut pas la faire revenir sans nouvelle revue.
        const { error } = await db.from('creator_apps').update({ status: 'suspended', published_manifest: null, published_knowledge: null, reviewed_by: reviewerId, reviewed_at: now, review_notes: reason, updated_at: now }).eq('slug', slug)
        if (error) fail('creatorApps.suspend', error)
      },
      async submit(slug, input) {
        const now = new Date().toISOString()
        const { error } = await db.from('creator_apps').update({ status: 'submitted', version: input.version, terms_accepted_at: input.termsAcceptedAt, submitted_at: now, updated_at: now, review_notes: null }).eq('slug', slug)
        if (error) fail('creatorApps.submit', error)
      },
      async saveChecks(slug, version, results) {
        const { error: delError } = await db.from('creator_app_checks').delete().eq('slug', slug).eq('version', version)
        if (delError) fail('creatorApps.saveChecks', delError)
        if (!results.length) return
        const { error } = await db.from('creator_app_checks').insert(results.map((r) => ({ slug, version, check: r.check, ok: r.ok, detail: r.detail })))
        if (error) fail('creatorApps.saveChecks', error)
      },
      async listChecks(slug, version) {
        const { data, error } = await db.from('creator_app_checks').select('check, ok, detail').eq('slug', slug).eq('version', version).order('created_at')
        if (error) fail('creatorApps.listChecks', error)
        return (data as Row[]).map((r): CreatorCheck => ({ check: str(r.check), ok: r.ok === true, detail: (r.detail as string | null) ?? null }))
      },
      async setShareToken(slug, hash) {
        const { error } = await db.from('creator_apps').update({ share_token_hash: hash, share_token_created_at: hash ? new Date().toISOString() : null }).eq('slug', slug)
        if (error) fail('creatorApps.setShareToken', error)
      },
      async getByShareTokenHash(hash) {
        const { data, error } = await db.from('creator_apps').select().eq('share_token_hash', hash).maybeSingle()
        if (error) fail('creatorApps.getByShareTokenHash', error)
        return data ? toCreatorApp(data as Row) : null
      },
      async listAll() {
        const { data, error } = await db.from('creator_apps').select().or('status.neq.draft,published_at.not.is.null').order('created_at')
        if (error) fail('creatorApps.listAll', error)
        return (data as Row[]).map(toCreatorApp)
      },
      async stats(slug, now): Promise<CreatorStats> {
        const since30 = new Date(now.getTime() - 30 * 86_400_000)
        const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString()
        const [{ count: onboarded, error: pError }, { data: rows, error: uError }] = await Promise.all([
          db.from('profiles').select('user_id', { count: 'exact', head: true }).eq('app_slug', slug).eq('status', 'active'),
          db.from('usage').select('user_id, created_at').eq('app_slug', slug).gte('created_at', since30.toISOString()).limit(50_000),
        ])
        if (pError) fail('creatorApps.stats', pError)
        if (uError) fail('creatorApps.stats', uError)
        const all = rows as Row[]
        const week = all.filter((r) => str(r.created_at) >= since7)
        return {
          onboarded: onboarded ?? 0,
          active7d: new Set(week.map((r) => str(r.user_id))).size,
          active30d: new Set(all.map((r) => str(r.user_id))).size,
          messages7d: week.length,
          messages30d: all.length,
        }
      },
    },
    creatorPayouts: {
      async create(input) {
        const { data, error } = await db.from('creator_payouts').insert({ slug: input.slug, amount_cents: input.amountCents, paid_at: input.paidAt, note: input.note, created_by: input.createdBy }).select().single()
        if (error) fail('creatorPayouts.create', error)
        return toPayout(data as Row)
      },
      async list(slug) {
        const { data, error } = await db.from('creator_payouts').select().eq('slug', slug).order('paid_at', { ascending: false })
        if (error) fail('creatorPayouts.list', error)
        return (data as Row[]).map(toPayout)
      },
    },
    toolRequests: {
      async create(input) {
        const { data, error } = await db.from('creator_tool_requests').insert({ slug: input.slug, owner_id: input.ownerId, title: input.title, body: input.body }).select().single()
        if (error) fail('toolRequests.create', error)
        return toToolRequest(data as Row)
      },
      async listBySlug(slug) {
        const { data, error } = await db.from('creator_tool_requests').select().eq('slug', slug).order('created_at')
        if (error) fail('toolRequests.listBySlug', error)
        return (data as Row[]).map(toToolRequest)
      },
      async setStatus(id, status) {
        const { error } = await db.from('creator_tool_requests').update({ status }).eq('id', id)
        if (error) fail('toolRequests.setStatus', error)
      },
    },
    creatorEvents: {
      async log(input) {
        const { error } = await db.from('creator_events').insert({ slug: input.slug, actor_id: input.actorId, action: input.action, details: input.details ?? null })
        if (error) fail('creatorEvents.log', error)
      },
    },
    stripeEvents: {
      async markProcessed(id, type) {
        // Insertion simple : un conflit de clé primaire signifie « déjà traité ».
        const { error } = await db.from('stripe_events').insert({ id, type })
        if (error) {
          if ((error as { code?: string }).code === '23505') return false
          fail('stripeEvents.markProcessed', error)
        }
        return true
      },
      async forget(id) {
        const { error } = await db.from('stripe_events').delete().eq('id', id)
        if (error) fail('stripeEvents.forget', error)
      },
    },
    audit: {
      async log(input) {
        const { error } = await db.from('audit_logs').insert({
          user_id: input.userId ?? null,
          action: input.action,
          details: input.details ?? {},
          ip: input.ip ?? null,
        })
        if (error) console.error('[audit.log]', error.message)
      },
      async require(input) {
        const { error } = await db.from('audit_logs').insert({
          user_id: input.userId ?? null,
          action: input.action,
          details: input.details ?? {},
          ip: input.ip ?? null,
        })
        if (error) fail('audit.require', error)
      },
    },
  }
  return repo
}
