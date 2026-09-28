'use client'

import { useEffect, useState } from 'react'
import { ArrowLeftRight, BellRing, MessageSquare, Pause, Play, Trash2, X } from 'lucide-react'
import type { Brand } from '@/apps/types'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/provider'

interface CheckinRow {
  id: string
  kind?: 'daily' | 'once'
  timeLocal: string
  days: number[] | null
  message: string
  active: boolean
}

interface CheckinsPanelProps {
  appSlug: string
  brand: Brand
  label: string
  /** Change quand l'IA pose ou retire un rappel dans le fil : la liste se relit. */
  version?: number
  onClose: () => void
  onSwap?: () => void
  onBackToChat?: () => void
}

/**
 * Panneau « Rappels » : tout ce que l'IA a programmé, une carte par rappel, avec l'heure en
 * grand, les jours, le message, pause et retrait. Rien ne passe par l'IA : la route directement.
 */
export function CheckinsPanel({ appSlug, brand, label, version = 0, onClose, onSwap, onBackToChat }: CheckinsPanelProps) {
  const { t } = useI18n()
  const [rows, setRows] = useState<CheckinRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/v1/${appSlug}/checkins`)
      .then((r) => (r.ok ? r.json() : { data: { checkins: [] } }))
      .then((d: { data?: { checkins?: CheckinRow[] } }) => {
        if (!cancelled) setRows(d.data?.checkins ?? [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [appSlug, version])

  async function toggle(row: CheckinRow) {
    setRows((rs) => rs?.map((r) => (r.id === row.id ? { ...r, active: !r.active } : r)) ?? null)
    await fetch(`/api/v1/${appSlug}/checkins`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: row.id, active: !row.active }) }).catch(() => undefined)
  }
  async function remove(row: CheckinRow) {
    setRows((rs) => rs?.filter((r) => r.id !== row.id) ?? null)
    await fetch(`/api/v1/${appSlug}/checkins`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: row.id }) }).catch(() => undefined)
  }

  const gradient = `linear-gradient(135deg, ${brand.from}, ${brand.to})`

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
        {rows === null ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/[0.1] px-4 py-10 text-center text-sm text-muted-foreground dark:border-white/[0.12]">{t.checkins.panelEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.id} className={`flex items-start gap-3 rounded-2xl border border-black/[0.06] bg-card px-3 py-3 dark:border-white/[0.08] ${row.active ? '' : 'opacity-60'}`}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white" style={row.active ? { background: gradient } : undefined} aria-hidden>
                  <BellRing className={`size-4 ${row.active ? '' : 'text-muted-foreground'}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">{row.timeLocal}</span>
                    <span className="text-xs text-muted-foreground">{row.kind === 'once' ? t.checkins.once : row.days ? row.days.map((d) => t.checkins.days[d - 1]).join(' · ') : t.checkins.everyDay}</span>
                  </div>
                  <p className="mt-1 text-sm">{row.message}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{row.active ? t.checkins.activeBadge : t.checkins.paused}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => void toggle(row)} aria-label={row.active ? t.checkins.pause : t.checkins.resume}>
                    {row.active ? <Pause /> : <Play />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground" onClick={() => void remove(row)} aria-label={t.checkins.remove}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
