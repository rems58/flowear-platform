'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { BellRing, Brain, ChevronDown, CircleHelp, FileText, ListChecks, Menu, MessageSquarePlus, Pin, PinOff, SquarePen, Table2, X } from 'lucide-react'
import { ArtifactPanel, type PanelType } from '@/components/artifacts/artifact-panel'
import { TasksPanel } from '@/components/tasks/tasks-panel'
import { LOCALE_META } from '@/core/i18n/locale'
import { errorMessage, type Messages } from '@/lib/i18n/messages'
import { useI18n } from '@/lib/i18n/provider'
import type { PublicApp } from '@/lib/public-app'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { UpgradeCard } from '@/components/billing/upgrade-card'
import { ThemeToggle } from '@/components/theme-toggle'
import { FlowearLogo } from '@/components/flowear-logo'
import { AppIcon } from '@/components/app-icon'
import { InstallBanner } from '@/components/pwa/install-banner'
import { InstallEntry } from '@/components/pwa/install-entry'
import { PushToggle } from '@/components/pwa/push-toggle'
import { Button } from '@/components/ui/button'
import { ChatActionsContext, type ChatActions } from './chat-actions'
import { CheckinsPanel } from '@/components/checkins/checkins-panel'
import { GuidePanel } from '@/components/help/guide-panel'
import { Composer } from './composer'
import { Suggestions } from './suggestions'
import { ContactForm } from './contact-form'
import { ReviewForm } from './review-form'
import { setPreference, usePreference } from '@/lib/pwa/preference'
import { RewardedButton } from '@/components/billing/rewarded-button'
import { MessageItem } from './message-item'

interface ChatShellProps {
  app: PublicApp
  /** Identité du chat côté client : l'id de la conversation, ou une valeur neuve pour une nouvelle. */
  chatKey: string
  conversationId: string | null
  initialMessages: UIMessage[]
  initialFeedback: Record<string, 'up' | 'down'>
  conversations: { id: string; title: string; updatedAt: string; pinned: boolean }[]
  /**
   * Navigation sans rendu serveur : le parent (`ChatSwitcher`) remonte le cadre avec la bonne
   * conversation. Absents, les liens font une navigation classique.
   */
  onOpenConversation?: (id: string) => void
  onNewConversation?: () => void
  /** Une conversation vient de naître (premier message) : le parent l'ajoute à la liste. */
  onConversationCreated?: (id: string) => void
  firstName: string | null
  /** Plan, semaine d'accueil et compteur du jour, calculés côté serveur. */
  access: AccessInfo
  /** Au moins un navigateur de la personne reçoit déjà les notifications de cette IA. */
  pushEnabled: boolean
  /** Message à envoyer de la part de la personne dès l'ouverture (rappel ouvert depuis une notification). */
  autoPrompt?: string | null
  /** L'IA a des rappels : le menu affiche leur liste. */
}

export interface AccessInfo {
  plan: 'free' | 'paid'
  /** Jours restants de la semaine d'accueil, calculés côté serveur ; null hors semaine. */
  trialDaysLeft: number | null
  trialEndedRecently: boolean
  messagesToday: number
  messagesPerDay: number
  messagesMonth: number
  messagesPerMonth: number
  /** Offre de bienvenue en cours (fin de fenêtre, remise), sinon null. */
  offer?: { endsAt: string; percentOff: number; source?: 'welcome' | 'promo' } | null
  /** Pub récompensée disponible (gratuit, régie configurée) : combien de vidéos restent, ce qu'elles rapportent. */
  ads?: { provider: 'gam'; slot: string; messagesPerVideo: number; videosLeft: number; bonusToday: number } | null
}

/** Message d'erreur traduit depuis le code de l'API ; le message serveur ne sert que de secours. */
function readableError(error: Error | undefined, t: Messages): string | null {
  if (!error) return null
  try {
    const parsed = JSON.parse(error.message) as { error?: { message?: string; code?: string } }
    if (parsed.error) return errorMessage(t, parsed.error.code, parsed.error.message)
  } catch {
    /* pas du JSON : code brut du flux (STREAM) ou message libre */
  }
  return errorMessage(t, error.message, error.message || null)
}

export function ChatShell({ app, chatKey, conversationId: initialConversationId, initialMessages, initialFeedback, conversations, firstName, access, pushEnabled, autoPrompt = null, onOpenConversation, onNewConversation, onConversationCreated }: ChatShellProps) {
  const { locale, t, f } = useI18n()
  // Messages envoyés depuis le chargement de la page : le compteur reste juste sans rechargement.
  const [sentSincePageLoad, setSentSincePageLoad] = useState(0)
  // L'identifiant de conversation est envoyé à chaque message (options de sendMessage) :
  // le serveur crée la conversation au premier message et la renvoie dans les métadonnées.
  const [conversationId, setConversationId] = useState(initialConversationId)
  // Panneau d'outil ouvert (fiches, comparatifs) et côté d'affichage sur ordinateur.
  const [panel, setPanel] = useState<PanelType | null>(null)
  // Bloc Outils repliable, déplié par défaut ; le choix reste sur cet appareil (confort, pas une donnée).
  const toolsOpen = usePreference('flowear:tools-open', '1') !== '0'
  const toggleTools = () => setPreference('flowear:tools-open', toolsOpen ? '0' : '1')
  const [panelSide, setPanelSide] = useState<'left' | 'right'>('right')
  // Mobile : on voit soit la conversation, soit le panneau.
  const [mobileView, setMobileView] = useState<'chat' | 'panel'>('chat')
  // Mobile : tiroir de gauche (nouvelle conversation, mémoire, outils, récents), façon Gemini.
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])
  function openPanel(type: PanelType) {
    // Le côté mémorisé est lu à l'ouverture, jamais au rendu : pas d'écart entre serveur et client.
    try {
      setPanelSide(window.localStorage.getItem('flowear.panelSide') === 'left' ? 'left' : 'right')
    } catch {
      /* stockage indisponible */
    }
    setPanel(type)
    setMobileView('panel')
  }
  function swapSide() {
    setPanelSide((s) => {
      const next = s === 'left' ? 'right' : 'left'
      try {
        window.localStorage.setItem('flowear.panelSide', next)
      } catch {
        /* stockage indisponible : on garde le côté pour la session */
      }
      return next
    })
  }

  // L'identifiant de conversation est lu dans l'en-tête de réponse : il arrive avant le
  // flux, donc même si la réponse IA échoue ensuite, le message suivant reste dans la
  // même conversation.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/v1/${app.slug}/chat`,
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          const id = response.headers.get('x-conversation-id')
          if (id) {
            setConversationId((current) => {
              if (current !== id) onConversationCreated?.(id)
              return id
            })
            window.history.replaceState(null, '', `/${app.slug}?c=${id}`)
          }
          return response
        },
      }),
    [app.slug, onConversationCreated]
  )

  const { messages, sendMessage, status, error, stop, clearError } = useChat({
    id: chatKey,
    messages: initialMessages,
    transport,
  })

  // Suivi du bas de page : tant que la personne est en bas, tout ce qui allonge le fil
  // (jeton, carte qui se déplie après coup) la garde en bas ; si elle remonte lire, on la
  // laisse. Un envoi de sa part la ramène en bas. On vise le bas du document, pas un repère
  // dans le fil : la zone d'écriture est collée en bas et couvrirait le repère.
  const mainRef = useRef<HTMLElement>(null)
  const followRef = useRef(true)
  useEffect(() => {
    const doc = document.documentElement
    const nearBottom = () => window.innerHeight + window.scrollY >= doc.scrollHeight - 160
    const onScroll = () => {
      followRef.current = nearBottom()
    }
    const toBottom = () => {
      if (followRef.current) window.scrollTo({ top: doc.scrollHeight })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(toBottom)
    if (mainRef.current) observer.observe(mainRef.current)
    return () => {
      window.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])
  const lastMessageId = messages[messages.length - 1]?.id
  const lastRole = messages[messages.length - 1]?.role
  useEffect(() => {
    // Un nouveau message de la personne : elle veut voir la suite, on la ramène en bas.
    if (lastRole === 'user') followRef.current = true
    if (followRef.current) window.scrollTo({ top: document.documentElement.scrollHeight })
  }, [lastMessageId, lastRole, status])

  const busy = status === 'submitted' || status === 'streaming'
  const errorText = readableError(error, t)
  // La dernière réponse attend déjà quelque chose (question à choix, minuteur, questionnaire) :
  // les suggestions ne doivent pas lui faire concurrence.
  const lastMessage = messages[messages.length - 1]
  const awaitingReply =
    lastMessage?.role === 'assistant' &&
    lastMessage.parts.some((p) => {
      if (!p.type.startsWith('tool-')) return false
      const part = p as { type: string; state?: string; output?: { kind?: string } }
      if (part.state !== 'output-available') return false
      if (part.type === 'tool-ask_choice' || part.type === 'tool-focus_timer') return true
      return part.type === 'tool-assessment' && part.output?.kind === 'question'
    })
  // Textes déjà envoyés par la personne : une suggestion utilisée ne se propose plus.
  const sentTexts = messages.filter((m) => m.role === 'user').map((m) => m.parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map((p) => p.text).join('\n'))

  // Le fuseau part avec chaque message : les rappels sont posés à l'heure locale de la personne.
  const send = useCallback(
    (text: string) => {
      let timezone: string | undefined
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch {
        /* fuseau inconnu : le serveur refusera de programmer un rappel */
      }
      setSentSincePageLoad((n) => n + 1)
      void sendMessage({ text }, { body: { conversationId, timezone } })
    },
    [sendMessage, conversationId]
  )
  const chatActions = useMemo<ChatActions>(() => ({ send, appSlug: app.slug, busy }), [send, app.slug, busy])

  // Ouverture depuis une notification de rappel : la question part toute seule, une fois.
  const autoSent = useRef(false)
  useEffect(() => {
    if (!autoPrompt || autoSent.current || initialMessages.length > 0) return
    // Différé d'un tour : en développement, React monte, démonte puis remonte le composant,
    // et un envoi lancé dans le premier montage serait annulé avec lui.
    const id = window.setTimeout(() => {
      if (autoSent.current) return
      autoSent.current = true
      send(autoPrompt)
      window.history.replaceState(null, '', `/${app.slug}`)
    }, 0)
    return () => window.clearTimeout(id)
  }, [autoPrompt, initialMessages.length, send, app.slug])

  // Bandeau de plan : semaine d'accueil en cours, puis mur : le gratuit garde quelques messages par mois.
  // Les messages gagnés par vidéo (au chargement, puis ceux de la session) s'ajoutent au quota du jour.
  const [earned, setEarned] = useState(0)
  const [earnedVideos, setEarnedVideos] = useState(0)
  const remainingDay = Math.max(0, access.messagesPerDay + (access.ads?.bonusToday ?? 0) + earned - access.messagesToday - sentSincePageLoad)
  const remainingMonth = Math.max(0, access.messagesPerMonth - access.messagesMonth - sentSincePageLoad)
  const remaining = Math.min(remainingDay, remainingMonth)
  let planText: string | null = null
  if (access.trialDaysLeft !== null) {
    const days = access.trialDaysLeft
    planText = days <= 1 ? t.plan.trialLastDay : f(t.plan.trialDaysLeft, { days })
  } else if (access.plan === 'free') {
    planText = remaining > 0 ? f(t.plan.freeRemainingDay, { remaining, limit: access.messagesPerDay }) : t.plan.freeExhaustedDay
  }
  const trialEndedText = access.trialEndedRecently ? t.plan.trialEnded : null
  const showUpgrade = access.plan === 'free'
  // La carte d'abonnement s'affiche tant que la personne n'a pas payé : pendant la semaine
  // d'accueil (elle rappelle l'échéance) et après le mur.
  const upgradeCard =
    showUpgrade || access.trialDaysLeft !== null ? (
      <UpgradeCard target="app" appSlug={app.slug} brand={app.brand} trialDaysLeft={access.trialDaysLeft} offer={access.offer ?? null} />
    ) : null

  // Épinglées en tête, puis les autres par date. L'épingle part à la route sans recharger.
  const [pins, setPins] = useState<Record<string, boolean>>({})
  const ordered = [...conversations]
    .map((c) => ({ ...c, pinned: pins[c.id] ?? c.pinned }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
  async function togglePin(id: string, pinned: boolean) {
    setPins((p) => ({ ...p, [id]: pinned }))
    await fetch(`/api/v1/${app.slug}/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned }),
    }).catch(() => undefined)
  }
  const conversationList = (
    <ul className="flex flex-col gap-0.5">
      {ordered.length === 0 ? (
        <li className="px-3 py-2 text-sm text-muted-foreground">{t.chat.noConversations}</li>
      ) : (
        ordered.map((c) => (
          <li key={c.id} className="group relative">
            <Link
              href={`/${app.slug}?c=${c.id}`}
              className={`flex items-center gap-1.5 truncate rounded-xl py-2 pl-3 pr-9 text-sm transition hover:bg-black/5 dark:hover:bg-white/10 ${c.id === conversationId ? 'bg-black/5 font-medium dark:bg-white/10' : 'text-muted-foreground'}`}
              onClick={(e) => {
                if (!onOpenConversation || c.id === conversationId) return
                e.preventDefault()
                onOpenConversation(c.id)
                setMenuOpen(false)
              }}
            >
              {c.pinned ? <Pin className="size-3 shrink-0 text-muted-foreground" aria-hidden /> : null}
              <span className="truncate">{c.title}</span>
            </Link>
            <button
              type="button"
              onClick={() => void togglePin(c.id, !c.pinned)}
              aria-label={c.pinned ? t.chat.unpin : t.chat.pin}
              aria-pressed={c.pinned}
              className={`absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1.5 text-muted-foreground transition hover:bg-black/10 dark:hover:bg-white/15 ${c.pinned ? '' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'}`}
            >
              {c.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </button>
          </li>
        ))
      )}
    </ul>
  )

  const newButton = (
    <div className="flex flex-col gap-2">
      <Button
        render={<Link href={`/${app.slug}`} />}
        nativeButton={false}
        size="sm"
        className="w-full rounded-full"
        aria-label={t.chat.newConversation}
        onClick={(e) => {
          if (!onNewConversation) return
          e.preventDefault()
          onNewConversation()
          setMenuOpen(false)
        }}
      >
        <MessageSquarePlus data-icon="inline-start" />
        {t.chat.newConversation}
      </Button>
      <Button render={<Link href={`/${app.slug}/memoire`} />} nativeButton={false} size="sm" variant="outline" className="w-full rounded-full" aria-label={t.chat.memory}>
        <Brain data-icon="inline-start" />
        {t.chat.memory}
      </Button>
    </div>
  )

  const planBanner =
    planText || trialEndedText ? (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-2 px-4 text-center text-xs text-muted-foreground">
        {trialEndedText ? <p>{trialEndedText}</p> : null}
        {planText ? <p>{planText}</p> : null}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {showUpgrade ? (
            <Button render={<Link href={`/pricing?app=${app.slug}`} />} nativeButton={false} size="sm" className="rounded-full">
              {t.plan.upgrade}
            </Button>
          ) : null}
          {showUpgrade && access.ads ? <RewardedButton appSlug={app.slug} ads={access.ads} earnedVideos={earnedVideos} onEarned={(m) => { setEarned((e) => e + m); setEarnedVideos((v) => v + 1) }} /> : null}
        </div>
      </div>
    ) : null

  // Nombre de rappels posés ou retirés dans le fil : la liste du menu se relit à chaque changement.
  const checkinChanges = messages.reduce(
    (n, m) => n + m.parts.filter((p) => (p.type === 'tool-schedule_checkin' || p.type === 'tool-cancel_checkin') && (p as { state?: string }).state === 'output-available').length,
    0
  )
  // Notifications, problème, avis : les trois réglages de la personne, ensemble en bas du menu.
  const notifications = (
    <>
      <PushToggle appSlug={app.slug} appName={app.name} locale={locale} initialEnabled={pushEnabled} />
      <ContactForm appSlug={app.slug} />
    </>
  )
  // Repli de la bannière d'installation une fois fermée : juste au dessus du logo Flowear,
  // dans le menu. Ne rend rien tant que la bannière est visible, ni sur ordinateur.
  const installEntry = <InstallEntry slug={app.slug} appName={app.name} />

  // Les outils sont ce que l'IA a de plus à offrir qu'une conversation : ils tiennent dans
  // un bloc bordé, chacun avec son icône aux couleurs de l'IA, pas dans une liste grise.
  const toolButtons = app.panels.length ? (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-black/[0.08] bg-card p-1.5 dark:border-white/[0.1]">
      <button
        type="button"
        onClick={toggleTools}
        aria-expanded={toolsOpen}
        className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.08]"
      >
        <span className="inline-flex items-center gap-2">
          {t.chat.tools}
          {!toolsOpen ? (
            <span className="flex items-center -space-x-1" aria-hidden>
              {app.panels.map((p) => {
                const Icon = p.type === 'fiche' ? FileText : p.type === 'tasks' ? ListChecks : p.type === 'checkin' ? BellRing : p.type === 'help' ? CircleHelp : Table2
                return (
                  <span key={p.type} className="flex size-5 items-center justify-center rounded-md text-white ring-2 ring-card" style={{ background: `linear-gradient(135deg, ${app.brand.from}, ${app.brand.to})` }}>
                    <Icon className="size-3" />
                  </span>
                )
              })}
            </span>
          ) : null}
        </span>
        <ChevronDown className={`size-4 transition-transform ${toolsOpen ? '' : '-rotate-90'}`} aria-hidden />
      </button>
      {toolsOpen ? app.panels.map((p) => {
        const Icon = p.type === 'fiche' ? FileText : p.type === 'tasks' ? ListChecks : p.type === 'checkin' ? BellRing : p.type === 'help' ? CircleHelp : Table2
        const active = panel === p.type
        return (
          <button
            key={p.type}
            type="button"
            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-medium transition-colors ${active ? 'bg-black/[0.06] dark:bg-white/[0.12]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]'}`}
            onClick={() => {
              if (active) setPanel(null)
              else openPanel(p.type)
              setMenuOpen(false)
            }}
            aria-pressed={active}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${app.brand.from}, ${app.brand.to})` }} aria-hidden>
              <Icon className="size-4" />
            </span>
            {p.label}
          </button>
        )
      }) : null}
    </div>
  ) : null

  const panelLabel = app.panels.find((p) => p.type === panel)?.label ?? ''
  const panelProps = {
    appSlug: app.slug,
    brand: app.brand,
    label: panelLabel,
    onClose: () => {
      setPanel(null)
      setMobileView('chat')
    },
    onSwap: swapSide,
    onBackToChat: () => setMobileView('chat'),
  }
  const panelNode = panel === 'tasks' ? <TasksPanel {...panelProps} /> : panel === 'checkin' ? <CheckinsPanel {...panelProps} version={checkinChanges} /> : panel === 'help' ? <GuidePanel {...panelProps} /> : panel ? <ArtifactPanel type={panel} {...panelProps} /> : null

  return (
    <ChatActionsContext.Provider value={chatActions}>
    <div className="flex min-h-dvh flex-col">
      {/* Mobile : menu, nom de l'IA seul, nouvelle conversation, langue, compte. Ordinateur : icône + nom, Flowear au centre. */}
      <header className="sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-black/5 bg-background/70 px-3 py-2 backdrop-blur-xl md:px-4 md:py-2.5 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={() => setMenuOpen(true)} aria-label={t.chat.menu} aria-expanded={menuOpen}>
            <Menu />
          </Button>
          <span className="hidden md:inline-flex">
            <AppIcon brand={app.brand} size={30} />
          </span>
          <h1 className="truncate text-base font-semibold tracking-tight">{app.name}</h1>
          {/* Abonné (pas la semaine d'accueil) : un petit « Pro » aux couleurs de l'IA, à côté du nom. */}
          {access.plan === 'paid' && access.trialDaysLeft === null ? (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ background: `linear-gradient(135deg, ${app.brand.from}, ${app.brand.to})` }}
              title={t.plan.proTitle}
            >
              {t.plan.pro}
            </span>
          ) : null}
        </div>
        <span aria-hidden />
        <div className="col-start-3 flex items-center justify-end gap-1 md:gap-2">
          <Button
            render={<Link href={`/${app.slug}`} />}
            nativeButton={false}
            variant="ghost"
            size="icon"
            className="rounded-full md:hidden"
            aria-label={t.chat.newConversation}
            onClick={(e) => {
              if (!onNewConversation) return
              e.preventDefault()
              onNewConversation()
            }}
          >
            <SquarePen />
          </Button>
          <ThemeToggle className="hidden md:inline-flex" />
          <LocaleSwitcher />
          <UserButton />
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true" aria-label={t.chat.menu}>
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} aria-label={t.common.close} />
          <aside
            className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col gap-3 overflow-hidden bg-background px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_0_60px_rgba(0,0,0,0.3)]"
            onClick={(e) => {
              // Un lien cliqué (conversation, mémoire, nouvelle) ferme le tiroir.
              if ((e.target as HTMLElement).closest('a')) setMenuOpen(false)
            }}
          >
            <div className="flex items-center justify-end px-1">
              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setMenuOpen(false)} aria-label={t.common.close}>
                <X />
              </Button>
            </div>
            {newButton}
            {upgradeCard}
            {toolButtons}
            {/* Seules les conversations défilent : le bas du menu (avis, logo) reste toujours visible. */}
            <div className="flex min-h-0 flex-1 flex-col">
              <p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t.chat.recent}</p>
              <div className="min-h-0 flex-1 overflow-y-auto">{conversationList}</div>
            </div>
            <div className="flex flex-col gap-1 border-t border-black/5 pt-3 dark:border-white/10">
              {installEntry}
              {notifications}
              <ReviewForm appSlug={app.slug} appName={app.name} />
            </div>
            <div className="flex items-center justify-between px-1">
              <Link href="/" className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold tracking-tight" aria-label={t.chat.backToHub}>
                <FlowearLogo size={22} />
                Flowear
              </Link>
              <ThemeToggle />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex flex-1">
        <aside className="sticky top-[53px] hidden h-[calc(100dvh-53px)] w-64 shrink-0 flex-col gap-3 overflow-hidden border-r border-black/5 px-3 py-4 md:flex dark:border-white/10" aria-label={t.chat.conversations}>
          {newButton}
          {toolButtons}
          {/* Seules les conversations défilent : l'avis et le logo restent toujours visibles en bas. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t.chat.conversations}</p>
            <div className="min-h-0 flex-1 overflow-y-auto">{conversationList}</div>
          </div>
          {upgradeCard ? <div className="pt-3">{upgradeCard}</div> : null}
          <div className="flex flex-col gap-1 border-t border-black/5 pt-3 dark:border-white/10">
            {installEntry}
            {notifications}
            <ReviewForm appSlug={app.slug} appName={app.name} />
          </div>
          <Link href="/" className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold tracking-tight transition hover:bg-black/5 dark:hover:bg-white/10`} aria-label={t.chat.backToHub}>
            <FlowearLogo size={22} />
            Flowear
          </Link>
        </aside>

        {/* Ordinateur : panneau collé (sa propre barre de défilement, la conversation garde la sienne). Mobile : panneau à la place de la conversation. */}
        {panelNode ? (
          <div
            className={`${mobileView === 'panel' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col bg-card md:sticky md:top-[53px] md:flex md:h-[calc(100dvh-53px)] md:flex-none md:basis-[45%] md:self-start md:overflow-hidden md:border-black/5 dark:md:border-white/10 ${panelSide === 'left' ? 'md:order-first md:border-r' : 'md:order-last md:border-l'}`}
          >
            {panelNode}
          </div>
        ) : null}

        <div className={`${panelNode && mobileView === 'panel' ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 flex-col`}>
          <InstallBanner slug={app.slug} appName={app.name} brand={app.brand} />
          {panelNode ? (
            <div className="flex justify-center border-b border-black/5 px-3 py-1.5 md:hidden dark:border-white/10">
              <Button size="xs" variant="outline" className="rounded-full" onClick={() => setMobileView('panel')}>
                {panelLabel}
              </Button>
            </div>
          ) : null}
      <main ref={mainRef} className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6">
        {messages.length === 0 ? (
          <div className="my-auto flex flex-col items-center gap-4 py-16 text-center">
            <AppIcon brand={app.brand} size={88} />
            <p className="text-3xl font-semibold tracking-tight">{firstName ? f(t.chat.greeting, { name: firstName }) : t.chat.greetingAnonymous}</p>
            <p className="max-w-prose text-muted-foreground">{app.tagline}</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-6" aria-live="polite">
            {messages.map((m, i) => (
              <li key={m.id}>
                <MessageItem
                  message={m}
                  brand={app.brand}
                  appSlug={app.slug}
                  appName={app.name}
                  initialFeedback={initialFeedback[m.id] ?? null}
                  pending={busy && i === messages.length - 1}
                  last={i === messages.length - 1}
                />
              </li>
            ))}
          </ol>
        )}
        {busy && status === 'submitted' ? <p className="text-sm text-muted-foreground">{f(t.chat.thinking, { name: app.name })}</p> : null}
        {!busy && lastMessage?.role === 'assistant' && !awaitingReply && app.suggestions.length ? (
          <Suggestions items={app.suggestions} sent={sentTexts} disabled={busy} onPick={send} />
        ) : null}
        {errorText ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            <span>{errorText}</span>
            <Button variant="ghost" size="sm" onClick={() => clearError()}>
              {t.common.close}
            </Button>
          </div>
        ) : null}
      </main>

      {/* À l'ouverture, les suggestions attendent juste au-dessus de la zone d'écriture. */}
      {messages.length === 0 && app.suggestions.length ? (
        <div className="mx-auto w-full max-w-2xl px-4 pb-2">
          <Suggestions items={app.suggestions} sent={sentTexts} disabled={busy} onPick={send} />
        </div>
      ) : null}
      {planBanner}
      <Composer
        disabled={busy}
        streaming={status === 'streaming'}
        onStop={stop}
        onSend={send}
        placeholder={f(t.chat.placeholder, { name: app.name })}
        lang={LOCALE_META[locale].bcp47}
      />
        </div>
      </div>
    </div>
    </ChatActionsContext.Provider>
  )
}
