'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PublicApp } from '@/lib/public-app'
import { errorMessage, type Messages } from '@/lib/i18n/messages'
import { useI18n } from '@/lib/i18n/provider'

interface Note {
  id: string
  content: string
  source: 'ai' | 'auto' | 'user'
  createdAt: string
}
interface ProfileRow {
  keys: string[]
  label: string
  value: string
}
interface MemoryData {
  onboarding: ProfileRow[]
  learned: ProfileRow[]
  notes: Note[]
  artifacts: { id: string; type: string; title: string; createdAt: string }[]
}

const SOURCE_KEY: Record<Note['source'], 'sourceAi' | 'sourceAuto' | 'sourceUser'> = { ai: 'sourceAi', auto: 'sourceAuto', user: 'sourceUser' }

async function api(t: Messages, path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const body = (await res.json().catch(() => null)) as { data?: unknown; error?: { code?: string; message?: string } } | null
  if (!res.ok) throw new Error(errorMessage(t, body?.error?.code, body?.error?.message))
  return body?.data
}

/**
 * Mémoire de l'IA, vue et corrigée par la personne : profil (réponses d'onboarding et
 * champs appris), souvenirs (notes), productions. Tout ce qui est ici entre dans le prompt.
 */
export function MemoryPanel({ app }: { app: PublicApp }) {
  const { t, f } = useI18n()
  const base = `/api/v1/${app.slug}/memory`
  const [data, setData] = useState<MemoryData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null)

  async function reload() {
    try {
      setData((await api(t, base)) as MemoryData)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.common.error)
    }
  }
  useEffect(() => {
    let alive = true
    api(t, base)
      .then((d) => {
        if (alive) setData(d as MemoryData)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : t.common.error)
      })
    return () => {
      alive = false
    }
  }, [base, t])

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.common.error)
    }
  }

  function addNote(e: FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (content.length < 3) return
    void run(async () => {
      await api(t, base, { method: 'POST', body: JSON.stringify({ content }) })
      setDraft('')
    })
  }

  const learned = data?.learned ?? []
  const onboarding = data?.onboarding ?? []

  /** Une ligne peut recouvrir plusieurs clés (un questionnaire) : on les oublie toutes. */
  function forget(row: ProfileRow) {
    void run(async () => {
      for (const key of row.keys) await api(t, `${base}/profile`, { method: 'PATCH', body: JSON.stringify({ key, value: null }) })
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link href={`/${app.slug}`} className="rounded-full p-2 transition hover:bg-muted" aria-label={t.memory.backToChat}>
          <ArrowLeft className="size-5" />
        </Link>
        <AppIcon brand={app.brand} size={36} />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{f(t.memory.title, { name: app.name })}</h1>
          <p className="text-sm text-muted-foreground">{f(t.memory.subtitle, { name: app.name })}</p>
        </div>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      <section className="rounded-3xl bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_-12px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.04] dark:ring-white/10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t.memory.profile}</h2>
        <dl className="flex flex-col gap-2">
          {onboarding.map((row) => (
            <div key={row.keys[0]} className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        {learned.length ? (
          <>
            <h3 className="mb-2 mt-5 text-sm font-medium uppercase tracking-wide text-muted-foreground">{f(t.memory.learned, { name: app.name })}</h3>
            <ul className="flex flex-col gap-2">
              {learned.map((row) => (
                <li key={row.keys[0]} className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="font-medium">{row.value}</span>
                  </span>
                  <Button variant="ghost" size="icon-xs" className="shrink-0" aria-label={f(t.memory.forgetKey, { key: row.label })} onClick={() => forget(row)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="rounded-3xl bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_-12px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.04] dark:ring-white/10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t.memory.notes}</h2>
        <form onSubmit={addNote} className="mb-4 flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.memory.notePlaceholder} maxLength={300} aria-label={t.memory.newNote} />
          <Button type="submit" size="icon" className="rounded-full" aria-label={t.common.add} disabled={draft.trim().length < 3}>
            <Plus />
          </Button>
        </form>
        {!data ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : data.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{f(t.memory.empty, { name: app.name })}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.notes.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                {editing?.id === n.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void run(async () => {
                        await api(t, `${base}/${n.id}`, { method: 'PUT', body: JSON.stringify({ content: editing.content }) })
                        setEditing(null)
                      })
                    }}
                  >
                    <Input value={editing.content} onChange={(e) => setEditing({ id: n.id, content: e.target.value })} maxLength={300} autoFocus aria-label={t.memory.editNote} />
                    <Button type="submit" size="sm" className="rounded-full">
                      {t.common.ok}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      {t.common.cancel}
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-col">
                      <span>{n.content}</span>
                      <span className="text-xs text-muted-foreground">{t.memory[SOURCE_KEY[n.source]]}</span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon-xs" aria-label={t.common.edit} onClick={() => setEditing({ id: n.id, content: n.content })}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label={t.common.forget} onClick={() => void run(() => api(t, `${base}/${n.id}`, { method: 'DELETE' }))}>
                        <Trash2 />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data?.artifacts.length ? (
        <section className="rounded-3xl bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_-12px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.04] dark:ring-white/10">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{f(t.memory.produced, { name: app.name })}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {data.artifacts.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 px-1 py-1">
                <span>{a.title}</span>
                <span className="text-muted-foreground">{(t.cards as Record<string, string>)[a.type] ?? a.type}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
