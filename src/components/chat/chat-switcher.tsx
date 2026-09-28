'use client'

import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import type { UIMessage } from 'ai'
import { ChatShell } from './chat-shell'

type ShellProps = ComponentProps<typeof ChatShell>
type ConversationRow = ShellProps['conversations'][number]

interface Loaded {
  key: string
  conversationId: string | null
  messages: UIMessage[]
  feedback: Record<string, 'up' | 'down'>
}

interface StoredMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: unknown[]
  feedback?: 'up' | 'down' | null
}

/**
 * Change de conversation sans repasser par le serveur de page : le cadre (`ChatShell`) est
 * remonté avec une clé neuve, une conversation ancienne est lue par la route qui existe déjà,
 * une nouvelle part de zéro. Le serveur ne rend la page qu'à l'arrivée ; ensuite tout est
 * instantané. L'adresse suit (bouton retour du navigateur compris).
 */
export function ChatSwitcher(props: Omit<ShellProps, 'onOpenConversation' | 'onNewConversation' | 'onConversationCreated'>) {
  const { app, chatKey, conversationId, initialMessages, initialFeedback, conversations: initialList, ...rest } = props
  const [loaded, setLoaded] = useState<Loaded>({ key: chatKey, conversationId, messages: initialMessages, feedback: initialFeedback })
  const [list, setList] = useState<ConversationRow[]>(initialList)
  const [pending, setPending] = useState<string | null>(null)
  const requestSeq = useRef(0)
  const router = useRouter()

  const openConversation = useCallback(
    async (id: string, push = true) => {
      const seq = ++requestSeq.current
      setPending(id)
      try {
        const res = await fetch(`/api/v1/${app.slug}/conversations/${encodeURIComponent(id)}`)
        const body = (await res.json().catch(() => null)) as { data?: { messages: StoredMessage[] } } | null
        if (seq !== requestSeq.current) return
        if (!res.ok || !body?.data) {
          // Introuvable ou refusée : la navigation classique tranchera (404, connexion…).
          router.push(`/${app.slug}?c=${id}`)
          return
        }
        const messages = body.data.messages.map((m) => ({ id: m.id, role: m.role === 'system' ? 'assistant' : m.role, parts: m.parts as UIMessage['parts'] }) as UIMessage)
        const feedback = Object.fromEntries(body.data.messages.filter((m) => m.feedback).map((m) => [m.id, m.feedback as 'up' | 'down']))
        setLoaded({ key: id, conversationId: id, messages, feedback })
        if (push) window.history.pushState({ c: id }, '', `/${app.slug}?c=${id}`)
      } finally {
        if (seq === requestSeq.current) setPending(null)
      }
    },
    [app.slug, router]
  )

  const newConversation = useCallback(
    (push = true) => {
      requestSeq.current++
      setPending(null)
      setLoaded({ key: `new-${Date.now()}`, conversationId: null, messages: [], feedback: {} })
      if (push) window.history.pushState({ c: null }, '', `/${app.slug}`)
    },
    [app.slug]
  )

  // Bouton retour / suivant du navigateur : on suit l'adresse sans recharger.
  useEffect(() => {
    const onPop = () => {
      const id = new URLSearchParams(window.location.search).get('c')
      if (id) void openConversation(id, false)
      else newConversation(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [openConversation, newConversation])

  const onConversationCreated = useCallback(
    (id: string) => {
      const now = new Date().toISOString()
      setList((l) => (l.some((c) => c.id === id) ? l : [{ id, title: '…', updatedAt: now, pinned: false }, ...l]))
      // Le titre est calculé après la réponse : on relit la liste un peu plus tard, sans bloquer.
      window.setTimeout(() => {
        fetch(`/api/v1/${app.slug}/conversations`)
          .then((r) => (r.ok ? r.json() : null))
          .then((b: { data?: { conversations?: ConversationRow[] } } | null) => {
            if (b?.data?.conversations) setList(b.data.conversations)
          })
          .catch(() => undefined)
      }, 8_000)
    },
    [app.slug]
  )

  return (
    <div aria-busy={pending !== null}>
      <ChatShell
        key={loaded.key}
        {...rest}
        app={app}
        chatKey={loaded.key}
        conversationId={loaded.conversationId}
        initialMessages={loaded.messages}
        initialFeedback={loaded.feedback}
        conversations={list}
        onOpenConversation={(id) => void openConversation(id)}
        onNewConversation={() => newConversation()}
        onConversationCreated={onConversationCreated}
      />
    </div>
  )
}
