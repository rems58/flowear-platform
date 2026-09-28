import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { appBrand } from '@/apps/types'
import { AppIcon } from '@/components/app-icon'
import { Markdown } from '@/components/chat/markdown'
import { pick } from '@/core/i18n/locale'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

/**
 * Contenu d'une conversation, vu par l'admin.
 *
 * C'est la page du garde-fou : on n'y arrive que par un clic explicite, et chaque rendu
 * écrit une ligne `conversation_read` dans `audit_logs` avec l'identifiant de l'admin.
 * Le journal existe pour être relu : il dit qui a lu quoi, et quand.
 */
export default async function ConversationReadPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  await ensureAppsLoaded()
  const adminId = await requireAdminPage()
  const { id, cid } = await params
  const userId = decodeURIComponent(id)
  if (!z.string().uuid().safeParse(cid).success) notFound()
  const repo = getRepo()
  const stats = await repo.admin.conversationStat(userId, cid)
  if (!stats) notFound()
  const app = getApp(stats.appSlug)
  // La trace est écrite avant la lecture, et une trace impossible à écrire empêche la
  // lecture : la règle « chaque ouverture est journalisée » ne souffre pas d'exception.
  await repo.audit.require({ userId: adminId, action: 'conversation_read', details: { conversationId: cid, ownerId: userId, appSlug: stats.appSlug } })
  const messages = await repo.messages.list(cid, userId, 200)

  const name = app ? pick(app.name, 'fr') : stats.appSlug
  return (
    <>
      <Link href={`/admin/personnes/${encodeURIComponent(userId)}?onglet=conversations`} className="text-sm text-muted-foreground hover:underline">
        ← {L.people.tabs.conversations}
      </Link>
      <div className="mb-1 mt-2 flex items-center gap-3">
        {app ? <AppIcon brand={appBrand(app, 'fr')} size={36} /> : null}
        <h1 className="text-2xl font-bold tracking-tight">{stats.title}</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        {name} · {fmt.n(stats.messages)} {L.people.messages} · {fmt.dateTime(stats.createdAt)}
      </p>
      <ol className="mx-auto flex max-w-2xl flex-col gap-5">
        {messages.map((m) => {
          const text = m.parts
            .filter((p): p is { type: 'text'; text: string } => typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text')
            .map((p) => p.text)
            .join('\n')
          return (
            <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
              {m.role === 'user' ? (
                <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-black/[0.06] px-4 py-2.5 dark:bg-white/[0.1]">{text}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Markdown text={text} />
                  <p className="text-xs text-muted-foreground">
                    {fmt.dateTime(m.createdAt)}
                    {m.feedback ? ` · ${m.feedback === 'up' ? L.people.thumbsUp : L.people.thumbsDown}` : ''}
                    {m.generic ? ` · ${L.people.generic}` : ''}
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}
