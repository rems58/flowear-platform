'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowLeftRight, ChevronRight, FileText, MessageSquare, Table2, X } from 'lucide-react'
import type { Brand } from '@/apps/types'
import { Button } from '@/components/ui/button'
import { ComparatifCard, type ComparatifCardData } from '@/components/chat/cards/comparatif-card'
import { FicheCard, type FicheCardData } from '@/components/chat/cards/fiche-card'
import { errorMessage } from '@/lib/i18n/messages'
import { useI18n } from '@/lib/i18n/provider'

export type PanelType = 'fiche' | 'comparatif' | 'tasks' | 'checkin' | 'help'

interface ArtifactItem {
  id: string
  type: 'fiche' | 'comparatif'
  title: string
  data: Record<string, unknown>
  createdAt: string
}

interface ArtifactPanelProps {
  appSlug: string
  brand: Brand
  type: 'fiche' | 'comparatif'
  label: string
  onClose: () => void
  /** Inverser le côté (ordinateur uniquement). */
  onSwap?: () => void
  /** Revenir à la conversation (mobile uniquement). */
  onBackToChat?: () => void
}

/**
 * Panneau d'un type de production : liste, puis détail rendu avec la même carte que dans le chat.
 * Se recharge à chaque ouverture : ce que l'IA vient de créer apparaît tout de suite.
 */
export function ArtifactPanel({ appSlug, brand, type, label, onClose, onSwap, onBackToChat }: ArtifactPanelProps) {
  const { locale, t, f } = useI18n()
  const [items, setItems] = useState<ArtifactItem[] | null>(null)
  const [locked, setLocked] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<ArtifactItem | null>(null)
  const Icon = type === 'fiche' ? FileText : Table2
  const gradient = `linear-gradient(135deg, ${brand.from}, ${brand.to})`

  useEffect(() => {
    let alive = true
    fetch(`/api/v1/${appSlug}/artifacts?type=${type}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { data?: { artifacts: ArtifactItem[]; locked?: number }; error?: { code?: string; message?: string } } | null
        if (!res.ok) throw new Error(errorMessage(t, body?.error?.code, body?.error?.message))
        if (alive) {
          setItems(body?.data?.artifacts ?? [])
          setLocked(body?.data?.locked ?? 0)
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : t.common.error)
      })
    return () => {
      alive = false
    }
  }, [appSlug, type, t])

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={label}>
      <header className="flex items-center gap-2 border-b border-black/5 px-3 py-2 dark:border-white/10">
        {open ? (
          <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => setOpen(null)} aria-label={t.panels.backToList}>
            <ArrowLeft />
          </Button>
        ) : null}
        <h2 className="flex-1 truncate text-sm font-semibold">{open ? open.title : label}</h2>
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
        ) : open ? (
          open.type === 'fiche' ? (
            <FicheCard data={open.data as unknown as FicheCardData} />
          ) : (
            <ComparatifCard data={open.data as unknown as ComparatifCardData} />
          )
        ) : items === null ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/[0.1] px-4 py-10 text-center text-sm text-muted-foreground dark:border-white/[0.12]">{t.panels.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {locked > 0 ? <li className="px-1 pb-1 text-xs text-muted-foreground">{f(t.panels.locked, { count: locked })}</li> : null}
            {items.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpen(a)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-black/[0.06] bg-card px-3 py-3 text-left transition-colors hover:border-black/[0.12] dark:border-white/[0.08] dark:hover:border-white/[0.16]"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: gradient }} aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium leading-snug">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString(locale)}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
