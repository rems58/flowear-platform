'use client'

import { useEffect, useState } from 'react'
import { ArrowLeftRight, MessageSquare, Send, X } from 'lucide-react'
import type { Brand } from '@/apps/types'
import { useChatActions } from '@/components/chat/chat-actions'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/i18n/messages'
import { useI18n } from '@/lib/i18n/provider'

interface GuideEntry {
  key: string
  title: string
  text: string
  example?: string
}
interface Guide {
  intro: string
  say: GuideEntry[]
  auto: GuideEntry[]
  always: GuideEntry[]
}

interface GuidePanelProps {
  appSlug: string
  brand: Brand
  label: string
  onClose: () => void
  onSwap?: () => void
  onBackToChat?: () => void
}

interface SectionProps {
  title: string
  items: GuideEntry[]
  numbered?: boolean
  gradient: string
  disabled: boolean
  onTry: (example: string) => void
}

function Section({ title, items, numbered, gradient, disabled, onTry }: SectionProps) {
  if (!items.length) return null
  return (
    <div>
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={it.key} className="flex items-start gap-3 rounded-2xl border border-black/[0.06] bg-card px-3 py-3 dark:border-white/[0.08]">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${numbered ? 'text-white' : 'bg-black/[0.06] text-muted-foreground dark:bg-white/[0.1]'}`} style={numbered ? { background: gradient } : undefined} aria-hidden>
              {numbered ? i + 1 : '·'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium leading-snug">{it.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{it.text}</p>
              {it.example ? (
                <button
                  type="button"
                  onClick={() => onTry(it.example!)}
                  disabled={disabled}
                  className="mt-2 inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-black/[0.15] px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-black/[0.3] hover:text-foreground disabled:cursor-default disabled:opacity-50 dark:border-white/[0.2] dark:hover:border-white/[0.4]"
                >
                  <Send className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">« {it.example} »</span>
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Panneau « Guide » : tout ce que la personne peut faire avec cette IA, déduit de son manifeste
 * par le serveur. Un exemple se touche et part comme un message ; sur téléphone, on revient
 * à la conversation pour voir la réponse.
 */
export function GuidePanel({ appSlug, brand, label, onClose, onSwap, onBackToChat }: GuidePanelProps) {
  const { t } = useI18n()
  const actions = useChatActions()
  const [guide, setGuide] = useState<Guide | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/v1/${appSlug}/guide`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { data?: Guide; error?: { code?: string; message?: string } } | null
        if (!res.ok) throw new Error(errorMessage(t, body?.error?.code, body?.error?.message))
        if (alive && body?.data) setGuide(body.data)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : t.common.error)
      })
    return () => {
      alive = false
    }
  }, [appSlug, t])

  const gradient = `linear-gradient(135deg, ${brand.from}, ${brand.to})`
  const disabled = !actions || actions.busy
  function tryExample(example: string) {
    if (!actions || actions.busy) return
    actions.send(example)
    onBackToChat?.()
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
        ) : !guide ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <p className="px-1 text-sm text-muted-foreground">{guide.intro}</p>
            <Section title={t.help.say} items={guide.say} numbered gradient={gradient} disabled={disabled} onTry={tryExample} />
            <Section title={t.help.auto} items={guide.auto} gradient={gradient} disabled={disabled} onTry={tryExample} />
            <Section title={t.help.always} items={guide.always} gradient={gradient} disabled={disabled} onTry={tryExample} />
          </div>
        )}
      </div>
    </section>
  )
}
