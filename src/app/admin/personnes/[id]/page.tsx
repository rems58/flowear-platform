import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listApps } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { AccountActions } from '@/components/admin/account-actions'
import { Section, SeverityBadge, StatCard, Table } from '@/components/admin/ui'
import { resolveAccess, trialDaysLeft } from '@/core/billing/entitlements'
import { LOCALE_META, isLocale, pick } from '@/core/i18n/locale'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

const TABS = ['summary', 'timeline', 'conversations', 'memory', 'reports', 'actions'] as const
type Tab = (typeof TABS)[number]

/**
 * Fiche d'une personne. Tout ce que la base sait d'elle, en onglets. Les conversations
 * s'affichent d'abord par leurs chiffres : le contenu ne s'ouvre que sur clic explicite,
 * sur une page qui journalise l'ouverture.
 */
export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ onglet?: string }> }) {
  await ensureAppsLoaded()
  await requireAdminPage()
  const { id } = await params
  const userId = decodeURIComponent(id)
  const { onglet } = await searchParams
  const tab: Tab = (TABS as readonly string[]).includes(onglet ?? '') ? (onglet as Tab) : 'summary'
  const repo = getRepo()
  const user = await repo.users.get(userId)
  if (!user) notFound()

  const apps = listApps()
  const names = new Map(apps.map((a) => [a.slug, pick(a.name, 'fr')]))

  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: L.people.tabs.summary },
    { key: 'timeline', label: L.people.tabs.timeline },
    { key: 'conversations', label: L.people.tabs.conversations },
    { key: 'memory', label: L.people.tabs.memory },
    { key: 'reports', label: L.people.tabs.reports },
    { key: 'actions', label: L.actions.title },
  ]

  return (
    <>
      <Link href="/admin/personnes" className="text-sm text-muted-foreground hover:underline">
        ← {L.people.title}
      </Link>
      <h1 className="mb-1 mt-2 text-3xl font-bold tracking-tight">{user.email ?? L.people.noEmail}</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        {isLocale(user.locale) ? LOCALE_META[user.locale].autonym : user.locale} · {L.people.createdAt.toLowerCase()} {fmt.date(user.createdAt)} · <code className="text-xs">{user.clerkUserId}</code>
        {user.tester ? <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide dark:bg-white/[0.1]">{L.actions.tester}</span> : null}
        {user.creator ? <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide dark:bg-white/[0.1]">{L.actions.creator}</span> : null}
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/personnes/${encodeURIComponent(userId)}?onglet=${t.key}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === t.key ? 'bg-foreground text-background' : 'bg-black/[0.06] hover:bg-black/[0.1] dark:bg-white/[0.1] dark:hover:bg-white/[0.16]'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'summary' ? <Summary userId={userId} names={names} /> : null}

      {tab === 'timeline' ? <Timeline userId={userId} /> : null}

      {tab === 'conversations' ? <Conversations userId={userId} names={names} /> : null}

      {tab === 'memory' ? <Memory userId={userId} names={names} /> : null}

      {tab === 'reports' ? <Reports userId={userId} /> : null}

      {tab === 'actions' ? (
        <Section title={L.actions.title}>
          {user.quotaResetAt ? (
            <p className="mb-3 text-xs text-muted-foreground">
              {L.actions.quotaResetAt} {fmt.dateTime(user.quotaResetAt)}
            </p>
          ) : null}
          <AccountActions userId={userId} email={user.email} tester={user.tester} creator={user.creator} />
        </Section>
      ) : null}
    </>
  )
}

/** Résumé : des comptes, jamais des listes, pour que la fiche s'ouvre vite même chargée. */
async function Summary({ userId, names }: { userId: string; names: Map<string, string> }) {
  const repo = getRepo()
  const now = new Date()
  const origin = new Date(0)
  const [subscriptions, perApp] = await Promise.all([
    repo.subscriptions.listActive(userId),
    Promise.all(
      Array.from(names.keys()).map(async (slug) => {
        const [profile, messages, cost, lastAt, devices, notes, artifacts] = await Promise.all([
          repo.profiles.get(userId, slug),
          repo.usage.countMessagesSince(userId, slug, origin),
          repo.usage.costSince(userId, slug, origin),
          repo.usage.lastMessageAt(userId, slug),
          repo.push.countForApp(userId, slug),
          repo.notes.countSince(userId, slug, origin),
          repo.artifacts.countSince(userId, slug, origin),
        ])
        return { slug, profile, messages, cost, lastAt, devices, notes, artifacts }
      })
    ),
  ])
  const used = perApp.filter((a) => a.profile)
  const lastSeen = perApp.reduce<Date | null>((best, a) => (a.lastAt && (!best || a.lastAt > best) ? a.lastAt : best), null)
  const bundle = resolveAccess(subscriptions, 'flowear', now)
  const trialDays = trialDaysLeft(bundle, now)
  return (
    <>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={L.people.plan} value={bundle.plan === 'paid' ? 'Payant' : 'Gratuit'} sub={trialDays !== null ? `${L.people.trial} ${L.people.trialUntil} ${fmt.date(bundle.trialEndsAt)}` : undefined} />
        <StatCard label={L.overview.messages} value={fmt.n(perApp.reduce((s, a) => s + a.messages, 0))} sub={`${L.people.lastSeen} : ${lastSeen ? fmt.dateTime(lastSeen) : L.people.never}`} />
        <StatCard label={L.people.cost} value={fmt.usd(perApp.reduce((s, a) => s + a.cost, 0))} />
        <StatCard label={L.people.devices} value={fmt.n(perApp.reduce((s, a) => s + a.devices, 0))} />
      </div>
      <Section title={L.people.perApp}>
        <Table
          head={[L.quality.app, L.people.messages, L.people.notes, L.people.artifacts, L.people.cost, L.people.lastSeen]}
          empty={L.people.noConversations}
          rows={used.map((a) => [
            <Link key={a.slug} href={`/admin/ia/${a.slug}`} className="font-medium text-[#5E5CE6] hover:underline">
              {names.get(a.slug)}
              {a.profile?.status !== 'active' ? <span className="ml-2 text-xs text-muted-foreground">({L.people.onboardingPending})</span> : null}
            </Link>,
            fmt.n(a.messages),
            fmt.n(a.notes),
            fmt.n(a.artifacts),
            fmt.usd(a.cost),
            a.lastAt ? fmt.dateTime(a.lastAt) : L.people.never,
          ])}
        />
      </Section>
    </>
  )
}

/** Mémoire : les listes complètes, seulement pour les IA où la personne a un profil. */
async function Memory({ userId, names }: { userId: string; names: Map<string, string> }) {
  const repo = getRepo()
  const perApp = await Promise.all(
    Array.from(names.keys()).map(async (slug) => {
      const profile = await repo.profiles.get(userId, slug)
      if (!profile) return null
      const [notes, artifacts] = await Promise.all([repo.notes.list(userId, slug, 100), repo.artifacts.list(userId, slug, 100)])
      return { slug, name: names.get(slug) ?? slug, profile, notes, artifacts }
    })
  )
  return (
    <>
      {perApp
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .map((a) => (
            <Section key={a.slug} title={a.name}>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-black/[0.06] p-4 text-sm dark:border-white/[0.08]">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{L.people.profile}</p>
                  {a.profile && Object.keys(a.profile.data).length ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      {Object.entries(a.profile.data).map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="break-words">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-muted-foreground">{L.common.none}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-black/[0.06] p-4 text-sm dark:border-white/[0.08]">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{L.people.notes}</p>
                  {a.notes.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {a.notes.map((n) => (
                        <li key={n.id}>{n.content}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">{L.common.none}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-black/[0.06] p-4 text-sm dark:border-white/[0.08]">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{L.people.artifacts}</p>
                  {a.artifacts.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {a.artifacts.map((x) => (
                        <li key={x.id}>
                          <span className="text-muted-foreground">{x.type} · </span>
                          {x.title}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">{L.common.none}</p>
                  )}
                </div>
              </div>
            </Section>
        ))}
    </>
  )
}

async function Timeline({ userId }: { userId: string }) {
  const events = await getRepo().events.listForUser(userId, 200)
  return (
    <Section title={L.people.tabs.timeline}>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{L.people.noEvents}</p>
      ) : (
        <ol className="relative flex flex-col gap-2 border-l border-black/[0.08] pl-4 dark:border-white/[0.1]">
          {events.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="text-muted-foreground">{fmt.dateTime(e.createdAt)}</span>
              <span className="mx-2 font-medium">{L.events[e.name] ?? e.name}</span>
              {e.appSlug ? <span className="text-muted-foreground">{e.appSlug}</span> : null}
              {Object.keys(e.props).length ? <code className="ml-2 text-xs text-muted-foreground">{JSON.stringify(e.props).slice(0, 120)}</code> : null}
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

async function Conversations({ userId, names }: { userId: string; names: Map<string, string> }) {
  const stats = await getRepo().admin.conversationStats(userId, 100)
  return (
    <Section title={L.people.tabs.conversations}>
      <p className="mb-3 text-sm text-muted-foreground">{L.people.readNotice}</p>
      <Table
        head={['', L.quality.app, L.people.messages, L.people.thumbsUp, L.people.thumbsDown, L.people.generic, L.people.lastSeen, '']}
        empty={L.people.noConversations}
        rows={stats.map((c) => [
          <span key={c.conversationId} className="font-medium">
            {c.title}
          </span>,
          names.get(c.appSlug) ?? c.appSlug,
          fmt.n(c.messages),
          fmt.n(c.thumbsUp),
          fmt.n(c.thumbsDown),
          fmt.n(c.genericAnswers),
          fmt.dateTime(c.updatedAt),
          <Link key={`${c.conversationId}-open`} href={`/admin/personnes/${encodeURIComponent(userId)}/conversations/${c.conversationId}`} className="font-medium text-[#5E5CE6] hover:underline">
            {L.people.openConversation}
          </Link>,
        ])}
      />
    </Section>
  )
}

async function Reports({ userId }: { userId: string }) {
  const reports = await getRepo().reports.listForUser(userId, 50)
  return (
    <Section title={L.people.tabs.reports}>
      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{L.people.noReports}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reports.map((r) => (
            <li key={r.id} className="rounded-2xl border border-black/[0.06] p-3 text-sm dark:border-white/[0.08]">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={r.severity} />
                <span className="font-medium">{L.inbox.category[r.category] ?? r.category}</span>
                <span className="text-muted-foreground">
                  {L.inbox.source[r.source]} · {fmt.dateTime(r.createdAt)} · {L.inbox.status[r.status]}
                </span>
              </div>
              {r.body ? <p className="mt-1 whitespace-pre-wrap">{r.body}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
