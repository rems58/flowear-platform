import type { Affiliate } from '@/core/growth/affiliates'
import type { AppSetting } from '@/core/config/schema'
import type { Repo } from './repo'
import { withAssessments } from '@/core/studio/manifest'
import { startOfUtcDay, startOfUtcMonth } from './time'
import type { AdReward, Artifact, Checkin, Conversation, Note, Profile, PushSubscriptionRecord, Report, StoredMessage, Subscription, Task, TrackedEvent, UsageRecord, User, WhopMembershipRecord, StudioSignup, CreatorApp, CreatorCheck, ToolRequest, CreatorPayout } from './types'

/**
 * Dépôt en mémoire, pour les tests et le développement sans base.
 * Même contrat que Supabase, mêmes règles de propriété.
 */
export function createMemoryRepo(seed: { settings?: AppSetting[]; subscriptions?: Subscription[] } = {}) {
  const users = new Map<string, User>()
  const profiles = new Map<string, Profile>()
  const notes: Note[] = []
  const conversations = new Map<string, Conversation>()
  const messages: StoredMessage[] = []
  const artifacts = new Map<string, Artifact>()
  const events: (TrackedEvent & { createdAt: string })[] = []
  const affiliates: Affiliate[] = []
  const studio: StudioSignup[] = []
  const creatorApps = new Map<string, CreatorApp>()
  const creatorChecks: (CreatorCheck & { slug: string; version: number })[] = []
  const toolRequests: ToolRequest[] = []
  const creatorPayouts: CreatorPayout[] = []
  const shareTokens = new Map<string, string>()
  const creatorEvents: { slug: string; actorId: string | null; action: string; details?: Record<string, unknown> }[] = []
  const whopSubs = new Map<string, Subscription>()
  const whopMemberships = new Map<string, WhopMembershipRecord>()
  const usage: (UsageRecord & { createdAt: string })[] = []
  const audit: { action: string; userId?: string | null; details?: Record<string, unknown> }[] = []
  const settings: AppSetting[] = [...(seed.settings ?? [])]
  const subscriptions: Subscription[] = [...(seed.subscriptions ?? [])]
  // Lignes créées par Stripe, indexées par identifiant d'abonnement (un webhook rejoué met à jour, n'ajoute pas).
  const stripeSubs = new Map<string, Subscription>()
  const stripeEventIds = new Set<string>()
  const pushSubscriptions: PushSubscriptionRecord[] = []
  const reports: Report[] = []
  const tasks: Task[] = []
  const rewards: AdReward[] = []
  const checkins: Checkin[] = []
  let seq = 0
  const nextId = () => `id_${++seq}`
  const nowIso = () => new Date().toISOString()
  const key = (u: string, a: string) => `${u}::${a}`

  const repo: Repo = {
    users: {
      async upsert({ clerkUserId, email, locale }) {
        const current = users.get(clerkUserId)
        const u: User = {
          clerkUserId,
          email: email === undefined ? (current?.email ?? null) : email,
          locale: locale ?? current?.locale ?? 'en',
          stripeCustomerId: current?.stripeCustomerId ?? null,
          digestEnabled: current?.digestEnabled ?? true,
          lastDigestAt: current?.lastDigestAt ?? null,
          tester: current?.tester ?? false,
          creator: current?.creator ?? false,
          quotaResetAt: current?.quotaResetAt ?? null,
          welcomeOfferUsedAt: current?.welcomeOfferUsedAt ?? null,
          deletedAt: current?.deletedAt ?? null,
          purgedAt: current?.purgedAt ?? null,
          createdAt: current?.createdAt ?? nowIso(),
        }
        users.set(clerkUserId, u)
        return u
      },
      async setTester(id, enabled) {
        const u = users.get(id)
        if (u) u.tester = enabled
      },
      async setCreator(id, enabled) {
        const u = users.get(id)
        if (u) u.creator = enabled
      },
      async resetQuota(id, at) {
        const u = users.get(id)
        if (u) u.quotaResetAt = at.toISOString()
      },
      async eraseContent(id) {
        for (const [k] of profiles) if (k.startsWith(`${id}::`)) profiles.delete(k)
        for (let i = notes.length - 1; i >= 0; i--) if (notes[i].userId === id) notes.splice(i, 1)
        for (const [k, c] of conversations) if (c.userId === id) conversations.delete(k)
        for (let i = messages.length - 1; i >= 0; i--) if (messages[i].userId === id) messages.splice(i, 1)
        for (const [k, a] of artifacts) if (a.userId === id) artifacts.delete(k)
        for (let i = pushSubscriptions.length - 1; i >= 0; i--) if (pushSubscriptions[i].userId === id) pushSubscriptions.splice(i, 1)
        for (let i = subscriptions.length - 1; i >= 0; i--) {
          const s = subscriptions[i]
          if (s.userId === id && !Array.from(stripeSubs.values()).includes(s)) subscriptions.splice(i, 1)
        }
        for (let i = reports.length - 1; i >= 0; i--) if (reports[i].userId === id) reports.splice(i, 1)
        for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].userId === id) tasks.splice(i, 1)
        for (let i = checkins.length - 1; i >= 0; i--) if (checkins[i].userId === id) checkins.splice(i, 1)
        for (let i = rewards.length - 1; i >= 0; i--) if (rewards[i].userId === id) rewards.splice(i, 1)
      },
      async anonymize(id) {
        const u = users.get(id)
        if (u) Object.assign(u, { email: null, locale: 'en', digestEnabled: false, tester: false, stripeCustomerId: null, deletedAt: u.deletedAt ?? nowIso() })
      },
      async exportAll(id) {
        const user = users.get(id)
        if (!user) return null
        const convs = Array.from(conversations.values()).filter((c) => c.userId === id)
        return {
          user,
          profiles: Array.from(profiles.values()).filter((p) => p.userId === id),
          notes: notes.filter((n) => n.userId === id),
          conversations: convs.map((conversation) => ({ conversation, messages: messages.filter((m) => m.conversationId === conversation.id) })),
          artifacts: Array.from(artifacts.values()).filter((a) => a.userId === id),
          subscriptions: subscriptions.filter((s) => s.userId === id),
          reports: reports.filter((r) => r.userId === id),
          events: await repo.events.listForUser(id, 5000),
        }
      },
      async get(id) {
        return users.get(id) ?? null
      },
      async getByEmail(email) {
        const wanted = email.toLowerCase()
        return Array.from(users.values()).find((u) => !u.deletedAt && u.email?.toLowerCase() === wanted) ?? null
      },
      async markDeleted(id, at = new Date()) {
        const u = users.get(id)
        if (u) u.deletedAt = at.toISOString()
      },
      async listToPurge(before, limit) {
        const cutoff = before.toISOString()
        return Array.from(users.values())
          .filter((u) => u.deletedAt && !u.purgedAt && u.deletedAt < cutoff)
          .sort((a, b) => a.deletedAt!.localeCompare(b.deletedAt!))
          .slice(0, limit)
      },
      async markPurged(id, at) {
        const u = users.get(id)
        if (u) u.purgedAt = at.toISOString()
      },
      async listDigestCandidates(before, limit) {
        return Array.from(users.values())
          .filter((u) => u.email && u.digestEnabled && (!u.lastDigestAt || u.lastDigestAt < before.toISOString()))
          .sort((a, b) => (a.lastDigestAt ?? '').localeCompare(b.lastDigestAt ?? '') || a.createdAt.localeCompare(b.createdAt))
          .slice(0, limit)
      },
      async markWelcomeOfferUsed(id, at) {
        const u = users.get(id)
        if (u) u.welcomeOfferUsedAt = at.toISOString()
      },
      async setDigest(id, enabled) {
        const u = users.get(id)
        if (u) u.digestEnabled = enabled
      },
      async markDigestSent(id, at) {
        const u = users.get(id)
        if (u) u.lastDigestAt = at.toISOString()
      },
      async setStripeCustomerId(id, customerId) {
        const u = users.get(id)
        if (u) u.stripeCustomerId = customerId
      },
      async list(query, limit) {
        return Array.from(users.values())
          .filter((u) => !query || (u.email ?? '').toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit)
      },
    },
    profiles: {
      async get(userId, appSlug) {
        return profiles.get(key(userId, appSlug)) ?? null
      },
      async upsert(userId, appSlug, data, status) {
        const p: Profile = { userId, appSlug, data, status, updatedAt: nowIso() }
        profiles.set(key(userId, appSlug), p)
        return p
      },
      async patch(userId, appSlug, patch) {
        const current = profiles.get(key(userId, appSlug))
        const p: Profile = {
          userId,
          appSlug,
          data: { ...(current?.data ?? {}), ...patch },
          status: current?.status ?? 'onboarding',
          updatedAt: nowIso(),
        }
        profiles.set(key(userId, appSlug), p)
        return p
      },
      async removeKey(userId, appSlug, k) {
        const current = profiles.get(key(userId, appSlug))
        if (!current) return null
        const data = { ...current.data }
        delete data[k]
        const p: Profile = { ...current, data, updatedAt: nowIso() }
        profiles.set(key(userId, appSlug), p)
        return p
      },
    },
    notes: {
      async list(userId, appSlug, limit) {
        return notes.filter((n) => n.userId === userId && n.appSlug === appSlug).slice(-limit).reverse()
      },
      async listSince(userId, appSlug, since, limit) {
        const from = since.toISOString()
        return notes.filter((n) => n.userId === userId && n.appSlug === appSlug && n.createdAt >= from).slice(-limit).reverse()
      },
      async countSince(userId, appSlug, since) {
        const from = since.toISOString()
        return notes.filter((n) => n.userId === userId && n.appSlug === appSlug && n.createdAt >= from).length
      },
      async add(userId, appSlug, content, source = 'ai') {
        const n: Note = { id: nextId(), userId, appSlug, content, source, createdAt: nowIso() }
        notes.push(n)
        return n
      },
      async update(id, userId, content) {
        const n = notes.find((x) => x.id === id && x.userId === userId)
        if (!n) return null
        n.content = content
        return n
      },
      async remove(id, userId) {
        const i = notes.findIndex((x) => x.id === id && x.userId === userId)
        if (i < 0) return false
        notes.splice(i, 1)
        return true
      },
    },
    conversations: {
      async create(userId, appSlug, title) {
        const c: Conversation = { id: nextId(), userId, appSlug, title, pinned: false, createdAt: nowIso(), updatedAt: nowIso() }
        conversations.set(c.id, c)
        return c
      },
      async get(id, userId, appSlug) {
        const c = conversations.get(id)
        return c && c.userId === userId && c.appSlug === appSlug ? c : null
      },
      async latest(userId, appSlug) {
        const mine = Array.from(conversations.values()).filter((c) => c.userId === userId && c.appSlug === appSlug)
        return mine.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
      },
      async list(userId, appSlug, limit) {
        return Array.from(conversations.values())
          .filter((c) => c.userId === userId && c.appSlug === appSlug)
          .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, limit)
      },
      async touch(id, userId, title) {
        const c = conversations.get(id)
        if (!c || c.userId !== userId) return
        c.updatedAt = nowIso()
        if (title) c.title = title
      },
      async setPinned(id, userId, pinned) {
        const c = conversations.get(id)
        if (!c || c.userId !== userId) return false
        c.pinned = pinned
        return true
      },
    },
    messages: {
      async list(conversationId, userId, limit) {
        return messages.filter((m) => m.conversationId === conversationId && m.userId === userId).slice(-limit)
      },
      async append(input) {
        if (messages.some((m) => m.id === input.id)) throw new Error(`[db] messages.append : identifiant déjà pris (${input.id})`)
        const m: StoredMessage = { ...input, generic: input.generic ?? null, feedback: null, createdAt: nowIso() }
        messages.push(m)
        return m
      },
      async setFeedback(messageId, userId, feedback) {
        const m = messages.find((x) => x.id === messageId && x.userId === userId)
        if (!m) return false
        m.feedback = feedback
        return true
      },
      async find(messageId, userId) {
        return messages.find((x) => x.id === messageId && x.userId === userId) ?? null
      },
    },
    artifacts: {
      async create(input) {
        const a: Artifact = {
          id: nextId(),
          userId: input.userId,
          appSlug: input.appSlug,
          conversationId: input.conversationId ?? null,
          type: input.type,
          title: input.title,
          data: input.data,
          publicSlug: null,
          createdAt: nowIso(),
        }
        artifacts.set(a.id, a)
        return a
      },
      async get(id, userId) {
        const a = artifacts.get(id)
        return a && a.userId === userId ? a : null
      },
      async list(userId, appSlug, limit) {
        return Array.from(artifacts.values())
          .filter((a) => a.userId === userId && a.appSlug === appSlug)
          .slice(-limit)
          .reverse()
      },
      async listSince(userId, appSlug, since, limit) {
        const from = since.toISOString()
        return Array.from(artifacts.values())
          .filter((a) => a.userId === userId && a.appSlug === appSlug && a.createdAt >= from)
          .slice(-limit)
          .reverse()
      },
      async countSince(userId, appSlug, since) {
        const from = since.toISOString()
        return Array.from(artifacts.values()).filter((a) => a.userId === userId && a.appSlug === appSlug && a.createdAt >= from).length
      },
    },
    events: {
      async track(event) {
        events.push({ ...event, createdAt: nowIso() })
      },
      async listRefOnboardings() {
        return events.filter((e) => e.name === 'onboarding_done' && e.utm?.ref && e.userId).map((e) => ({ userId: e.userId as string, ref: e.utm?.ref as string, createdAt: e.createdAt, appSlug: e.appSlug ?? null }))
      },
      async firstPaidAt(userIds) {
        const out = new Map<string, string>()
        for (const e of events) {
          if (e.name !== 'subscribed' || !e.userId || !userIds.includes(e.userId) || !e.props?.subscriptionId) continue
          if (!out.has(e.userId) || e.createdAt < (out.get(e.userId) as string)) out.set(e.userId, e.createdAt)
        }
        return out
      },
      async listPayments(userIds) {
        return events
          .filter((e) => e.name === 'payment' && e.userId && userIds.includes(e.userId))
          .map((e) => ({ userId: e.userId as string, amountCents: Number(e.props?.amountCents ?? 0), createdAt: e.createdAt, appSlug: e.appSlug ?? null }))
      },
      async listPaymentsForApp(appSlug) {
        return events
          .filter((e) => e.name === 'payment' && e.userId && e.appSlug === appSlug)
          .map((e) => ({ userId: e.userId as string, amountCents: Number(e.props?.amountCents ?? 0), createdAt: e.createdAt, appSlug: e.appSlug ?? null }))
      },
      async listForUser(userId, limit) {
        return events
          .map((e, i) => ({ id: String(i), name: e.name, appSlug: e.appSlug ?? null, props: e.props ?? {}, createdAt: e.createdAt, userId: e.userId }))
          .filter((e) => e.userId === userId)
          .reverse()
          .slice(0, limit)
      },
    },
    studioWaitlist: {
      async add(input) {
        if (studio.some((s) => s.email === input.email)) return 'exists'
        studio.push({ id: nextId(), ...input, createdAt: nowIso() })
        return 'added'
      },
      async count() {
        return studio.length
      },
      async list(limit) {
        return [...studio].reverse().slice(0, limit)
      },
    },
    affiliates: {
      async list() {
        return [...affiliates].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      },
      async create(input) {
        if (affiliates.some((a) => a.code === input.code)) throw new Error('affiliate_exists')
        const a: Affiliate = { ...input, appSlug: input.appSlug ?? null, createdAt: nowIso() }
        affiliates.push(a)
        return a
      },
      async remove(code) {
        const i = affiliates.findIndex((a) => a.code === code)
        if (i >= 0) affiliates.splice(i, 1)
      },
    },
    usage: {
      async record(u) {
        usage.push({ ...u, createdAt: nowIso() })
      },
      async countMessagesToday(userId, appSlug, now) {
        const from = startOfUtcDay(now).toISOString()
        return usage.filter((u) => u.userId === userId && u.appSlug === appSlug && u.createdAt >= from).length
      },
      async costTodayUsd(userId, appSlug, now) {
        const from = startOfUtcDay(now).toISOString()
        return usage
          .filter((u) => u.userId === userId && u.appSlug === appSlug && u.createdAt >= from)
          .reduce((s, u) => s + u.costUsd, 0)
      },
      async costMonthUsd(userId, appSlug, now) {
        return this.costSince(userId, appSlug, startOfUtcMonth(now))
      },
      async costSince(userId, appSlug, since) {
        const from = since.toISOString()
        return usage
          .filter((u) => u.userId === userId && u.appSlug === appSlug && u.createdAt >= from)
          .reduce((s, u) => s + u.costUsd, 0)
      },
      async countMessagesSince(userId, appSlug, since) {
        const from = since.toISOString()
        return usage.filter((u) => u.userId === userId && u.appSlug === appSlug && u.createdAt >= from).length
      },
      async activeDays(userId, appSlug, since) {
        const from = since.toISOString()
        const days = new Set(usage.filter((u) => u.userId === userId && u.appSlug === appSlug && u.createdAt >= from).map((u) => u.createdAt.slice(0, 10)))
        return days.size
      },
      async lastMessageAt(userId, appSlug) {
        const dates = usage.filter((u) => u.userId === userId && u.appSlug === appSlug).map((u) => u.createdAt)
        if (dates.length === 0) return null
        return new Date(dates.reduce((a, b) => (a > b ? a : b)))
      },
    },
    appSettings: {
      async list() {
        return settings
      },
      async upsert(setting) {
        const i = settings.findIndex((s) => s.key === setting.key && JSON.stringify(s.scope) === JSON.stringify(setting.scope))
        if (i >= 0) settings[i] = setting
        else settings.push(setting)
      },
      async remove(scope, key) {
        const i = settings.findIndex((s) => s.key === key && JSON.stringify(s.scope) === JSON.stringify(scope))
        if (i >= 0) settings.splice(i, 1)
      },
    },
    visits: {
      async record() {
        /* rien à mesurer en mémoire */
      },
    },
    subscriptions: {
      async listActive(userId) {
        return subscriptions.filter((s) => s.userId === userId)
      },
      async startTrial(userId, appSlug, endsAt) {
        if (subscriptions.some((s) => s.userId === userId && s.appSlug === appSlug)) return false
        subscriptions.push({ userId, appSlug, status: 'trialing', currentPeriodEnd: endsAt.toISOString() })
        return true
      },
      async upsertFromWhop(input) {
        const existing = whopSubs.get(input.whopMembershipId)
        const row: Subscription = { userId: input.userId, appSlug: input.appSlug, status: input.status, currentPeriodEnd: input.currentPeriodEnd }
        if (existing) Object.assign(existing, row)
        else {
          whopSubs.set(input.whopMembershipId, row)
          subscriptions.push(row)
        }
      },
      async hasWhop(userId) {
        return Array.from(whopSubs.values()).some((s) => s.userId === userId && ['active', 'trialing', 'past_due'].includes(s.status))
      },
      async extendTrial(userId, appSlug, days, now) {
        const trial = subscriptions.find((s) => s.userId === userId && s.appSlug === appSlug && s.status === 'trialing' && !Array.from(stripeSubs.values()).includes(s))
        if (!trial || !trial.currentPeriodEnd) return false
        const current = new Date(trial.currentPeriodEnd)
        const base = current.getTime() > now.getTime() ? current : now
        trial.currentPeriodEnd = new Date(base.getTime() + days * 86_400_000).toISOString()
        return true
      },
      async listStripeIds(userId) {
        return Array.from(stripeSubs.entries()).filter(([, s]) => s.userId === userId && ['active', 'trialing', 'past_due'].includes(s.status)).map(([id]) => id)
      },
      async gift(userId, appSlug, days, now) {
        const existing = subscriptions.find((s) => s.userId === userId && s.appSlug === appSlug && s.status === 'active' && !Array.from(stripeSubs.values()).includes(s))
        if (existing && existing.currentPeriodEnd) {
          const current = new Date(existing.currentPeriodEnd)
          const base = current.getTime() > now.getTime() ? current : now
          existing.currentPeriodEnd = new Date(base.getTime() + days * 86_400_000).toISOString()
          return
        }
        subscriptions.push({ userId, appSlug, status: 'active', currentPeriodEnd: new Date(now.getTime() + days * 86_400_000).toISOString() })
      },
      async upsertFromStripe(input) {
        const existing = stripeSubs.get(input.stripeSubscriptionId)
        const row: Subscription = { userId: input.userId, appSlug: input.appSlug, status: input.status, currentPeriodEnd: input.currentPeriodEnd }
        if (existing) Object.assign(existing, row)
        else {
          stripeSubs.set(input.stripeSubscriptionId, row)
          subscriptions.push(row)
        }
      },
    },
    push: {
      async save(input) {
        const existing = pushSubscriptions.find((p) => p.endpoint === input.endpoint && p.appSlug === input.appSlug)
        if (existing) {
          Object.assign(existing, { userId: input.userId, keys: { p256dh: input.p256dh, auth: input.auth }, locale: input.locale })
          return
        }
        pushSubscriptions.push({
          id: nextId(),
          userId: input.userId,
          appSlug: input.appSlug,
          endpoint: input.endpoint,
          keys: { p256dh: input.p256dh, auth: input.auth },
          locale: input.locale,
          lastNudgedAt: null,
        })
      },
      async remove(userId, appSlug, endpoint) {
        const i = pushSubscriptions.findIndex((p) => p.userId === userId && p.appSlug === appSlug && p.endpoint === endpoint)
        if (i === -1) return false
        pushSubscriptions.splice(i, 1)
        return true
      },
      async removeExpired(endpoint) {
        for (let i = pushSubscriptions.length - 1; i >= 0; i--) {
          if (pushSubscriptions[i].endpoint === endpoint) pushSubscriptions.splice(i, 1)
        }
      },
      async countForApp(userId, appSlug) {
        return pushSubscriptions.filter((p) => p.userId === userId && p.appSlug === appSlug).length
      },
      async listDue(before, limit) {
        const from = before.toISOString()
        return pushSubscriptions
          .filter((p) => p.lastNudgedAt === null || p.lastNudgedAt < from)
          .sort((a, b) => (a.lastNudgedAt ?? '').localeCompare(b.lastNudgedAt ?? ''))
          .slice(0, limit)
      },
      async markNudged(id, at) {
        const found = pushSubscriptions.find((p) => p.id === id)
        if (found) found.lastNudgedAt = at.toISOString()
      },
      async listForApp(appSlug) {
        return pushSubscriptions.filter((p) => p.appSlug === appSlug)
      },
      async listForUserApp(userId, appSlug) {
        return pushSubscriptions.filter((s) => s.userId === userId && s.appSlug === appSlug)
      },
    },
    tasks: {
      async createMany(inputs) {
        const created: Task[] = []
        for (const input of inputs) {
          const t: Task = {
            id: nextId(),
            userId: input.userId,
            appSlug: input.appSlug,
            conversationId: input.conversationId,
            title: input.title,
            firstAction: input.firstAction,
            steps: input.steps ?? [],
            energy: input.energy,
            estimateMin: input.estimateMin,
            actualMin: null,
            status: 'open',
            createdAt: nowIso(),
            updatedAt: nowIso(),
            doneAt: null,
          }
          tasks.push(t)
          created.push(t)
        }
        return created
      },
      async get(id, userId, appSlug) {
        return tasks.find((t) => t.id === id && t.userId === userId && t.appSlug === appSlug) ?? null
      },
      async listOpen(userId, appSlug, limit) {
        return tasks.filter((t) => t.userId === userId && t.appSlug === appSlug && (t.status === 'open' || t.status === 'deferred')).slice(0, limit)
      },
      async listAll(userId, appSlug, limit) {
        return tasks.filter((t) => t.userId === userId && t.appSlug === appSlug).slice(-limit).reverse()
      },
      async findByTitle(userId, appSlug, title) {
        const wanted = title.trim().toLowerCase()
        return tasks.find((t) => t.userId === userId && t.appSlug === appSlug && t.status !== 'dropped' && t.title.trim().toLowerCase() === wanted) ?? null
      },
      async update(id, userId, patch) {
        const t = tasks.find((x) => x.id === id && x.userId === userId)
        if (!t) return null
        Object.assign(t, patch, { updatedAt: nowIso() })
        if (patch.status === 'done' && !t.doneAt) t.doneAt = nowIso()
        return t
      },
      async timeStats(userId, appSlug) {
        const done = tasks.filter((t) => t.userId === userId && t.appSlug === appSlug && t.status === 'done')
        const measured = done.filter((t) => t.estimateMin && t.actualMin)
        const est = measured.reduce((a, t) => a + (t.estimateMin ?? 0), 0)
        const act = measured.reduce((a, t) => a + (t.actualMin ?? 0), 0)
        return { finished: done.length, measured: measured.length, ratio: est > 0 ? act / est : null }
      },
    },
    checkins: {
      async create(input) {
        const c: Checkin = { ...input, id: nextId(), lastSentAt: null, active: true, createdAt: nowIso() }
        checkins.push(c)
        return c
      },
      async list(userId, appSlug) {
        return checkins.filter((c) => c.userId === userId && c.appSlug === appSlug)
      },
      async get(id, userId, appSlug) {
        return checkins.find((c) => c.id === id && c.userId === userId && c.appSlug === appSlug) ?? null
      },
      async listDue(before, limit) {
        const until = before.toISOString()
        return checkins
          .filter((c) => c.active && c.nextRunAt <= until)
          .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
          .slice(0, limit)
      },
      async advance(id, nextRunAt, sentAt) {
        const c = checkins.find((x) => x.id === id)
        if (!c) return
        c.lastSentAt = sentAt.toISOString()
        if (nextRunAt) c.nextRunAt = nextRunAt.toISOString()
        else c.active = false
      },
      async setActive(id, userId, active) {
        const c = checkins.find((x) => x.id === id && x.userId === userId)
        if (!c) return false
        c.active = active
        return true
      },
      async remove(id, userId) {
        const i = checkins.findIndex((x) => x.id === id && x.userId === userId)
        if (i < 0) return false
        checkins.splice(i, 1)
        return true
      },
    },
    rewards: {
      async start(input) {
        const r: AdReward = { id: nextId(), ...input, status: 'pending', createdAt: nowIso(), grantedAt: null }
        rewards.push(r)
        return r
      },
      async grant(nonce, userId, at, maxAgeMs) {
        const r = rewards.find((x) => x.nonce === nonce && x.userId === userId && x.status === 'pending' && new Date(x.createdAt).getTime() >= at.getTime() - maxAgeMs)
        if (!r) return null
        r.status = 'granted'
        r.grantedAt = at.toISOString()
        return r
      },
      async today(userId, appSlug, day) {
        const rows = rewards.filter((x) => x.userId === userId && x.appSlug === appSlug && x.day === day && x.status === 'granted')
        return { videos: rows.length, messages: rows.reduce((s, x) => s + x.messages, 0) }
      },
    },
    reports: {
      async create(input) {
        const r: Report = {
          id: nextId(),
          userId: input.userId ?? null,
          appSlug: input.appSlug ?? null,
          conversationId: input.conversationId ?? null,
          messageId: input.messageId ?? null,
          source: input.source,
          category: input.category,
          severity: input.severity,
          rating: input.rating ?? null,
          body: input.body ?? null,
          status: 'new',
          resolution: null,
          resolvedBy: null,
          resolvedAt: null,
          createdAt: nowIso(),
        }
        reports.push(r)
        return r
      },
      async get(id) {
        return reports.find((r) => r.id === id) ?? null
      },
      async list({ status, limit }) {
        const rank = { high: 0, medium: 1, low: 2 }
        return reports
          .filter((r) => !status || r.status === status)
          .sort((a, b) => rank[a.severity] - rank[b.severity] || b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit)
      },
      async listForUser(userId, limit) {
        return reports.filter((r) => r.userId === userId).reverse().slice(0, limit)
      },
      async countNew() {
        return reports.filter((r) => r.status === 'new').length
      },
      async setStatus(id, status, resolution, by) {
        const r = reports.find((x) => x.id === id)
        if (!r) return null
        r.status = status
        if (status === 'resolved') {
          r.resolution = resolution
          r.resolvedBy = by
          r.resolvedAt = nowIso()
        }
        return r
      },
    },
    // Agrégats : le dépôt en mémoire ne les calcule pas, les vues SQL sont testées contre la
    // vraie base. Ici on renvoie des valeurs vides mais bien formées.
    admin: {
      async overview() {
        return {
          usersTotal: users.size,
          signupsToday: 0,
          signupsWeek: 0,
          signupsMonth: 0,
          activeToday: 0,
          activeWeek: 0,
          activeMonth: 0,
          messagesToday: 0,
          messagesWeek: 0,
          costTodayUsd: 0,
          costMonthUsd: 0,
          subscribers: 0,
          inTrial: 0,
          reportsNew: reports.filter((r) => r.status === 'new').length,
        }
      },
      async dailyActivity() {
        return []
      },
      async welcomeConversion() {
        return { signups30d: users.size, convertedInWindow: 0, convertedAny: 0, offerUsed: 0 }
      },
      async freeTierDays() {
        return []
      },
      async peopleSpend() {
        return []
      },
      async cohorts() {
        return []
      },
      async funnel() {
        return []
      },
      async quality() {
        return []
      },
      async conversationStats(userId, limit) {
        return Array.from(conversations.values())
          .filter((c) => c.userId === userId)
          .slice(0, limit)
          .map((c) => {
            const own = messages.filter((m) => m.conversationId === c.id)
            return {
              conversationId: c.id,
              userId: c.userId,
              appSlug: c.appSlug,
              title: c.title,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
              messages: own.length,
              thumbsUp: own.filter((m) => m.feedback === 'up').length,
              thumbsDown: own.filter((m) => m.feedback === 'down').length,
              genericAnswers: own.filter((m) => m.generic === true).length,
            }
          })
      },
      async conversationStat(userId, conversationId) {
        return (await repo.admin.conversationStats(userId, 1000)).find((c) => c.conversationId === conversationId) ?? null
      },
      async paidSubscriptions() {
        return Array.from(stripeSubs.values())
          .filter((s) => s.status === 'active' || s.status === 'past_due')
          .map((s) => ({ userId: s.userId, appSlug: s.appSlug, interval: null, status: s.status }))
      },
      async trialConversion() {
        return { trialsEnded: 0, converted: 0 }
      },
      async churnMonth() {
        return { churned: 0, atMonthStart: 0 }
      },
      async attribution() {
        return []
      },
      async dailyVisits() {
        return []
      },
      async weeklyActive() {
        return {}
      },
      async launchedAt(appSlug) {
        const dates = Array.from(profiles.values())
          .filter((p) => p.appSlug === appSlug && p.status === 'active')
          .map((p) => p.updatedAt)
        return dates.length ? new Date(dates.sort()[0]) : null
      },
    },
    whopMemberships: {
      async upsert(record) {
        whopMemberships.set(record.membershipId, { ...record })
      },
      async listPendingByEmail(email) {
        const wanted = email.toLowerCase()
        return Array.from(whopMemberships.values()).filter((m) => !m.userId && m.email === wanted && ['active', 'trialing', 'past_due'].includes(m.status))
      },
      async attach(membershipId, userId) {
        const m = whopMemberships.get(membershipId)
        if (m) m.userId = userId
      },
    },
    creatorApps: {
      async listPublished() {
        return Array.from(creatorApps.values()).filter((a) => a.publishedManifest !== null && a.status !== 'suspended')
      },
      async get(slug) {
        return creatorApps.get(slug) ?? null
      },
      async listByOwner(ownerId) {
        return Array.from(creatorApps.values()).filter((a) => a.ownerId === ownerId)
      },
      async saveDraft(input) {
        const existing = creatorApps.get(input.slug)
        if (existing && existing.ownerId !== input.ownerId) throw new Error('slug_taken')
        const now = nowIso()
        const row: CreatorApp = existing
          ? { ...existing, manifest: input.manifest, knowledge: input.knowledge, requests: input.requests ?? existing.requests, updatedAt: now }
          : {
              slug: input.slug,
              ownerId: input.ownerId,
              status: 'draft',
              manifest: input.manifest,
              knowledge: input.knowledge,
              requests: input.requests ?? {},
              version: 1,
              publishedManifest: null,
              publishedKnowledge: null,
              reviewNotes: null,
              reviewedBy: null,
              reviewedAt: null,
              termsAcceptedAt: null,
              sharePercent: 50,
              shareLinkAt: null,
              createdAt: now,
              updatedAt: now,
              submittedAt: null,
              publishedAt: null,
            }
        creatorApps.set(input.slug, row)
        return { ...row }
      },
      async setAssessments(slug, assessments) {
        const row = creatorApps.get(slug)
        if (!row) throw new Error('not_found')
        creatorApps.set(slug, { ...row, manifest: withAssessments(row.manifest, assessments), updatedAt: nowIso() })
      },
      async listByStatus(statuses) {
        return Array.from(creatorApps.values()).filter((a) => statuses.includes(a.status)).sort((a, b) => (a.submittedAt ?? a.updatedAt).localeCompare(b.submittedAt ?? b.updatedAt))
      },
      async publish(slug, reviewerId, input = {}) {
        const row = creatorApps.get(slug)
        if (!row) throw new Error('not_found')
        const now = nowIso()
        creatorApps.set(slug, { ...row, status: 'published', publishedManifest: row.manifest, publishedKnowledge: row.knowledge, reviewedBy: reviewerId, reviewedAt: now, reviewNotes: null, publishedAt: now, updatedAt: now, sharePercent: input.sharePercent ?? row.sharePercent })
      },
      async requestChanges(slug, reviewerId, notes) {
        const row = creatorApps.get(slug)
        if (!row) throw new Error('not_found')
        const now = nowIso()
        creatorApps.set(slug, { ...row, status: row.status === 'published' ? 'published' : 'changes_requested', reviewedBy: reviewerId, reviewedAt: now, reviewNotes: notes, updatedAt: now })
      },
      async suspend(slug, reviewerId, reason) {
        const row = creatorApps.get(slug)
        if (!row) throw new Error('not_found')
        const now = nowIso()
        creatorApps.set(slug, { ...row, status: 'suspended', publishedManifest: null, publishedKnowledge: null, reviewedBy: reviewerId, reviewedAt: now, reviewNotes: reason, updatedAt: now })
      },
      async submit(slug, input) {
        const row = creatorApps.get(slug)
        if (!row) throw new Error('not_found')
        const now = nowIso()
        creatorApps.set(slug, { ...row, status: 'submitted', version: input.version, termsAcceptedAt: input.termsAcceptedAt, submittedAt: now, updatedAt: now, reviewNotes: null })
      },
      async saveChecks(slug, version, results) {
        for (let i = creatorChecks.length - 1; i >= 0; i--) if (creatorChecks[i].slug === slug && creatorChecks[i].version === version) creatorChecks.splice(i, 1)
        for (const r of results) creatorChecks.push({ slug, version, ...r })
      },
      async listChecks(slug, version) {
        return creatorChecks.filter((c) => c.slug === slug && c.version === version).map(({ check, ok, detail }) => ({ check, ok, detail }))
      },
      async setShareToken(slug, hash) {
        const row = creatorApps.get(slug)
        if (!row) throw new Error('not_found')
        for (const [h, sl] of shareTokens) if (sl === slug) shareTokens.delete(h)
        if (hash) shareTokens.set(hash, slug)
        creatorApps.set(slug, { ...row, shareLinkAt: hash ? nowIso() : null })
      },
      async getByShareTokenHash(hash) {
        const slug = shareTokens.get(hash)
        return slug ? (creatorApps.get(slug) ?? null) : null
      },
      async listAll() {
        return Array.from(creatorApps.values()).filter((a) => a.status !== 'draft' || a.publishedAt !== null)
      },
      async stats(slug, now) {
        const since = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
        const rows = (days: number) => usage.filter((u) => u.appSlug === slug && u.createdAt >= since(days))
        return {
          onboarded: Array.from(profiles.values()).filter((p) => p.appSlug === slug && p.status === 'active').length,
          active7d: new Set(rows(7).map((u) => u.userId)).size,
          active30d: new Set(rows(30).map((u) => u.userId)).size,
          messages7d: rows(7).length,
          messages30d: rows(30).length,
        }
      },
    },
    creatorPayouts: {
      async create(input) {
        const row: CreatorPayout = { id: nextId(), slug: input.slug, amountCents: input.amountCents, paidAt: input.paidAt, note: input.note, createdAt: nowIso() }
        creatorPayouts.push(row)
        return { ...row }
      },
      async list(slug) {
        return creatorPayouts.filter((p) => p.slug === slug).sort((a, b) => b.paidAt.localeCompare(a.paidAt)).map((p) => ({ ...p }))
      },
    },
    toolRequests: {
      async create(input) {
        const row: ToolRequest = { id: nextId(), ...input, status: 'open', createdAt: nowIso() }
        toolRequests.push(row)
        return { ...row }
      },
      async listBySlug(slug) {
        return toolRequests.filter((r) => r.slug === slug).map((r) => ({ ...r }))
      },
      async setStatus(id, status) {
        const r = toolRequests.find((x) => x.id === id)
        if (r) r.status = status
      },
    },
    creatorEvents: {
      async log(input) {
        creatorEvents.push(input)
      },
    },
    stripeEvents: {
      async markProcessed(id) {
        if (stripeEventIds.has(id)) return false
        stripeEventIds.add(id)
        return true
      },
      async forget(id) {
        stripeEventIds.delete(id)
      },
    },
    audit: {
      async log(input) {
        audit.push(input)
      },
      async require(input) {
        audit.push(input)
      },
    },
  }

  return { repo, state: { users, profiles, notes, conversations, messages, artifacts, events, usage, audit, tasks, checkins, creatorEvents } }
}
