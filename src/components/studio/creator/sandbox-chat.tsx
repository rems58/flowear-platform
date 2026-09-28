'use client'

import { useMemo, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Composer } from '@/components/chat/composer'
import { MessageItem } from '@/components/chat/message-item'
import { Button } from '@/components/ui/button'
import { SUPPORTED_LOCALES, type Locale } from '@/core/i18n/locale'
import type { CreatorKnowledgeFile } from '@/core/data/types'
import { SANDBOX_MESSAGES_PER_DAY } from '@/core/studio/limits'
import { useI18n } from '@/lib/i18n/provider'

interface Props {
  manifest: Record<string, unknown>
  knowledge: CreatorKnowledgeFile[]
  brand: { from: string; to: string; glyph: string }
  appName: string
  disabled: boolean
}

function textOf(parts: { type: string; text?: string }[]): string {
  return parts.filter((p) => p.type === 'text' && p.text).map((p) => p.text as string).join('\n')
}

/**
 * Conversation avec le brouillon : même transport que le chat de production, mais chaque
 * envoi porte le manifeste, les connaissances et l'historique en texte, puisque le serveur
 * ne garde rien. Les cartes s'affichent, inactives : on regarde ce que l'IA fait, on ne joue pas.
 */
export function SandboxChat({ manifest, knowledge, brand, appName, disabled }: Props) {
  const { t, f, locale: uiLocale } = useI18n()
  const [locale, setLocale] = useState<Locale>(uiLocale)
  const [session, setSession] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/studio/sandbox',
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages[messages.length - 1]
          const history = messages.slice(0, -1).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: textOf(m.parts as { type: string; text?: string }[]).slice(0, 4000) })).filter((h) => h.text)
          return { body: { manifest, knowledge, locale, timezone, history, message: textOf(last.parts as { type: string; text?: string }[]) } }
        },
        fetch: async (input, init) => {
          const res = await fetch(input, init)
          if (!res.ok) {
            const body = (await res.clone().json().catch(() => null)) as { error?: { code?: string } } | null
            setFailure(body?.error?.code ?? `http_${res.status}`)
          } else setFailure(null)
          return res
        },
      }),
    [manifest, knowledge, locale, timezone]
  )
  const { messages, sendMessage, status, stop, setMessages } = useChat({ id: `sandbox-${session}`, transport })
  const streaming = status === 'submitted' || status === 'streaming'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{f(t.creator.sandboxIntro, { n: SANDBOX_MESSAGES_PER_DAY })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          {t.creator.sandboxLocale}
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <Button type="button" variant="outline" size="sm" className="cursor-pointer rounded-full" onClick={() => { setMessages([]); setSession((s) => s + 1) }}>
          {t.creator.sandboxReset}
        </Button>
      </div>
      <div className="flex min-h-64 flex-col gap-5 rounded-2xl border border-black/[0.06] bg-muted/30 p-4 dark:border-white/[0.08]">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <p key={m.id} className="self-end rounded-2xl px-4 py-2 text-white" style={{ background: brand.from }}>
              {textOf(m.parts as { type: string; text?: string }[])}
            </p>
          ) : (
            <MessageItem key={m.id} message={m} brand={brand} appSlug="sandbox" appName={appName} initialFeedback={null} pending last={i === messages.length - 1} />
          )
        )}
        {failure ? <p role="alert" className="text-sm text-destructive">{failure === 'rate_limited' ? f(t.creator.sandboxIntro, { n: SANDBOX_MESSAGES_PER_DAY }) : t.creator.submitError}</p> : null}
      </div>
      <Composer disabled={disabled} streaming={streaming} placeholder={t.creator.sandboxPlaceholder} onSend={(text) => void sendMessage({ text })} onStop={() => void stop()} />
    </div>
  )
}
