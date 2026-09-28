'use client'

import { useEffect, useState } from 'react'
import { ArrowLeftRight, Check, Clock, CornerDownRight, MessageSquare, X } from 'lucide-react'
import type { Brand } from '@/apps/types'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/i18n/messages'
import { useI18n } from '@/lib/i18n/provider'

type Energy = 'low' | 'mid' | 'high'
type Status = 'open' | 'done' | 'deferred' | 'dropped'

interface TaskRow {
  id: string
  title: string
  firstAction: string
  steps: { title: string; done: boolean }[]
  energy: Energy
  estimateMin: number | null
  actualMin: number | null
  status: Status
  createdAt: string
  doneAt: string | null
}

interface TasksPanelProps {
  appSlug: string
  brand: Brand
  label: string
  onClose: () => void
  onSwap?: () => void
  onBackToChat?: () => void
}

const ENERGY_RANK: Record<Energy, number> = { low: 0, mid: 1, high: 2 }
/** Une couleur par niveau d'énergie : vert = facile même à plat, ambre = normale, rose = en forme. */
const ENERGY_DOT: Record<Energy, string> = { low: 'bg-emerald-500', mid: 'bg-amber-500', high: 'bg-rose-500' }

/** Même ordre que `next_action` : ouvertes avant reportées, faciles avant dures, anciennes d'abord. */
function suggestedOrder(a: TaskRow, b: TaskRow): number {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1
  if (ENERGY_RANK[a.energy] !== ENERGY_RANK[b.energy]) return ENERGY_RANK[a.energy] - ENERGY_RANK[b.energy]
  return a.createdAt < b.createdAt ? -1 : 1
}

function Section({ title, count, children, muted }: { title: string; count: number; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={muted ? 'opacity-70' : ''}>
      <p className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        <span className="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums dark:bg-white/[0.1]">{count}</span>
      </p>
      {children}
    </div>
  )
}

/**
 * Panneau « Tâches » : tout ce que l'IA a rangé pour la personne, à faire puis fait, une
 * carte par tâche avec une case ronde. Cocher part vers la route des tâches sans passer par
 * l'IA ; l'IA le voit au message suivant par son prompt. Se recharge à chaque ouverture.
 */
export function TasksPanel({ appSlug, brand, label, onClose, onSwap, onBackToChat }: TasksPanelProps) {
  const { locale, t, f } = useI18n()
  const [rows, setRows] = useState<TaskRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/v1/${appSlug}/tasks`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { data?: { tasks: TaskRow[] }; error?: { code?: string; message?: string } } | null
        if (!res.ok) throw new Error(errorMessage(t, body?.error?.code, body?.error?.message))
        if (alive) setRows(body?.data?.tasks ?? [])
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : t.common.error)
      })
    return () => {
      alive = false
    }
  }, [appSlug, t])

  async function setStatus(row: TaskRow, status: Status) {
    setRows((rs) => rs?.map((r) => (r.id === row.id ? { ...r, status, doneAt: status === 'done' ? new Date().toISOString() : r.doneAt } : r)) ?? null)
    await fetch(`/api/v1/${appSlug}/tasks/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => undefined)
  }

  const todo = (rows ?? []).filter((r) => r.status === 'open' || r.status === 'deferred').sort(suggestedOrder)
  const done = (rows ?? []).filter((r) => r.status === 'done').sort((a, b) => ((a.doneAt ?? '') < (b.doneAt ?? '') ? 1 : -1))
  const dropped = (rows ?? []).filter((r) => r.status === 'dropped')
  const gradient = `linear-gradient(135deg, ${brand.from}, ${brand.to})`

  function Row({ row }: { row: TaskRow }) {
    const isDone = row.status === 'done'
    const isDropped = row.status === 'dropped'
    const closed = isDone || isDropped
    const stepsDone = row.steps.filter((s) => s.done).length
    const checkId = `task-${row.id}`
    return (
      <li className={`flex items-start gap-3 rounded-2xl border border-black/[0.06] bg-card px-3 py-3 transition-colors dark:border-white/[0.08] ${closed ? 'opacity-70' : 'hover:border-black/[0.12] dark:hover:border-white/[0.16]'}`}>
        <span className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center">
          <input
            id={checkId}
            type="checkbox"
            className="peer absolute inset-0 size-6 cursor-pointer appearance-none rounded-full border-2 border-black/20 transition-colors checked:border-transparent disabled:cursor-default dark:border-white/30"
            style={isDone ? { background: gradient } : undefined}
            checked={isDone}
            onChange={() => void setStatus(row, isDone ? 'open' : 'done')}
            aria-label={isDone ? t.tasks.markOpen : t.tasks.markDone}
            disabled={isDropped}
          />
          <Check className="pointer-events-none relative size-3.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor={checkId} className={`block cursor-pointer text-[15px] font-medium leading-snug ${closed ? 'text-muted-foreground line-through' : ''}`}>
            {row.title}
          </label>
          {!closed ? (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
              <CornerDownRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{row.firstAction}</span>
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${ENERGY_DOT[row.energy]}`} aria-hidden />
              {t.tasks.energy[row.energy]}
            </span>
            {row.estimateMin || row.actualMin ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden />
                {row.actualMin ? f(t.tasks.minutes, { minutes: row.actualMin }) : f(t.tasks.minutes, { minutes: row.estimateMin ?? 0 })}
              </span>
            ) : null}
            {row.steps.length ? <span>{f(t.tasks.stepsDone, { done: stepsDone, total: row.steps.length })}</span> : null}
            {row.status === 'deferred' ? <span className="rounded-full bg-black/[0.06] px-2 py-0.5 dark:bg-white/[0.1]">{t.tasks.deferred}</span> : null}
            {isDropped ? <span className="rounded-full bg-black/[0.06] px-2 py-0.5 dark:bg-white/[0.1]">{t.tasks.droppedBadge}</span> : null}
            {closed ? <span>{new Date(row.doneAt ?? row.createdAt).toLocaleDateString(locale)}</span> : null}
          </div>
        </div>
      </li>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={label}>
      <header className="flex items-center gap-2 border-b border-black/5 px-3 py-2 dark:border-white/10">
        <h2 className="flex-1 truncate text-sm font-semibold">{label}</h2>
        {onBackToChat ? (
          <Button variant="ghost" size="icon-sm" className="rounded-full md:hidden" onClick={onBackToChat} aria-label={t.panels.backToChat}>
            <MessageSquare />
          </Button>
        ) : null}
        {onSwap ? (
          <Button variant="ghost" size="icon-sm" className="hidden rounded-full md:inline-flex" onClick={onSwap} aria-label={t.panels.swapSide}>
            <ArrowLeftRight />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={onClose} aria-label={t.panels.close}>
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            {error}
          </p>
        ) : rows === null ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/[0.1] px-4 py-10 text-center text-sm text-muted-foreground dark:border-white/[0.12]">{t.tasks.panelEmpty}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <Section title={t.tasks.panelTodo} count={todo.length}>
              {todo.length ? <p className="mb-2 px-1 text-xs text-muted-foreground">{t.tasks.panelOrder}</p> : null}
              <ul className="flex flex-col gap-2">{todo.map((r) => <Row key={r.id} row={r} />)}</ul>
            </Section>
            {done.length ? (
              <Section title={t.tasks.panelDone} count={done.length}>
                <ul className="flex flex-col gap-2">{done.map((r) => <Row key={r.id} row={r} />)}</ul>
              </Section>
            ) : null}
            {dropped.length ? (
              <Section title={t.tasks.panelDropped} count={dropped.length} muted>
                <ul className="flex flex-col gap-2">{dropped.map((r) => <Row key={r.id} row={r} />)}</ul>
              </Section>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
