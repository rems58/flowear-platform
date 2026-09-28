import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { after } from 'next/server'
import type { UIMessage } from 'ai'
import { z } from 'zod'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { quotaSince } from '@/core/admin/actions'
import { quotaWindowStart, resolveAccess, trialDaysLeft } from '@/core/billing/entitlements'
import { currentOfferFor } from '@/core/billing/welcome-offer'
import { resolveConfig } from '@/core/config/resolve'
import { startOfUtcDay, startOfUtcMonth } from '@/core/data/time'
import type { StoredMessage } from '@/core/data/types'
import { ChatSwitcher } from '@/components/chat/chat-switcher'
import { UtmCapture } from '@/components/utm-capture'
import { readUtm, recordVisit } from '@/lib/analytics/visit'
import { OnboardingForm } from '@/components/onboarding/onboarding-form'
import { getRepo } from '@/lib/db/repo'
import { getAdminIds, getServerEnv } from '@/lib/env'
import { canSeePrivate } from '@/lib/access'
import { getLocale } from '@/lib/i18n/server'
import { toPublicApp } from '@/lib/public-app'

type Props = {
  params: Promise<{ app: string }>
  searchParams: Promise<{ new?: string; c?: string; ask?: string } & Record<string, string | string[] | undefined>>
}

function toUIMessage(m: StoredMessage): UIMessage {
  return { id: m.id, role: m.role === 'system' ? 'assistant' : m.role, parts: m.parts as UIMessage['parts'] }
}

/**
 * Page d'une IA : connexion requise, onboarding tant que le profil n'est pas actif,
 * puis chat : nouvelle conversation par défaut, ou celle demandée par ?c=<id>.
 */
export default async function AppPage({ params, searchParams }: Props) {
  const { app: slug } = await params
  await ensureAppsLoaded()
  const app = getApp(slug)
  if (!app) notFound()

  const sp = await searchParams
  // Lien direct vers une IA (bio TikTok, par exemple) : la visite se compte avec son origine,
  // et l'origine survit à la connexion pour être rattachée à l'onboarding.
  const utm = readUtm(sp)
  after(() => recordVisit(`/${slug}`, utm))
  const { userId } = await auth()
  if (!userId) {
    const back = utm ? `/${slug}?${new URLSearchParams(Object.entries(utm).map(([k, v]) => [k === 'ref' ? 'ref' : `utm_${k}`, v])).toString()}` : `/${slug}`
    redirect(`/sign-in?redirect_url=${encodeURIComponent(back)}`)
  }
  // Une IA privée n'existe pas pour qui n'est pas administrateur.
  // Privée : visible des administrateurs et des testeurs. Les testeurs gardent le parcours normal.
  if (app.access === 'private' && !(await canSeePrivate(userId))) notFound()

  const repo = getRepo()
  // /<slug> tout court = nouvelle conversation. Une conversation ne s'ouvre que par ?c=<id>.
  const requestedId = sp.c && z.string().uuid().safeParse(sp.c).success ? sp.c : null
  const askedId = sp.ask && z.string().uuid().safeParse(sp.ask).success ? sp.ask : null
  const now = new Date()
  const admin = getAdminIds().has(userId)

  // Première vague : tout ce qui ne dépend que de la personne et de l'adresse part ensemble.
  // Deux vagues au lieu de quatre : chaque vague coûte un aller-retour vers la base.
  const [locale, profile, conversation, asked, conversations, subscriptions, settings, user, pushDevices] = await Promise.all([
    getLocale(userId),
    repo.profiles.get(userId, slug),
    requestedId ? repo.conversations.get(requestedId, userId, slug) : Promise.resolve(null),
    // Rappel ouvert depuis une notification : sa question part de la part de la personne, dans
    // une conversation neuve. Le rappel doit lui appartenir, sinon rien ne part.
    askedId ? repo.checkins.get(askedId, userId, slug) : Promise.resolve(null),
    repo.conversations.list(userId, slug, 20),
    repo.subscriptions.listActive(userId),
    repo.appSettings.list(),
    repo.users.get(userId),
    repo.push.countForApp(userId, slug),
  ])
  const publicApp = toPublicApp(app, locale)
  if (!profile || profile.status !== 'active') {
    return (
      <>
        <UtmCapture />
        <OnboardingForm app={publicApp} />
      </>
    )
  }
  const config = resolveConfig(app, settings)
  const accessState = resolveAccess(subscriptions, slug, now)
  // Seconde vague : ce qui dépend de la première (les messages de la conversation, les
  // compteurs de quota dont la fenêtre dépend de l'accès). Mêmes fenêtres que la boucle agent.
  const { NEXT_PUBLIC_AD_PROVIDER: adProvider, NEXT_PUBLIC_GAM_REWARDED_SLOT: adSlot } = getServerEnv()
  const [messages, messagesToday, messagesMonth, rewards] = await Promise.all([
    conversation ? repo.messages.list(conversation.id, userId, 200) : Promise.resolve([] as StoredMessage[]),
    repo.usage.countMessagesSince(userId, slug, quotaSince(startOfUtcDay(now), user?.quotaResetAt)),
    repo.usage.countMessagesSince(userId, slug, quotaSince(quotaWindowStart(accessState, startOfUtcMonth(now)), user?.quotaResetAt)),
    repo.rewards.today(userId, slug, startOfUtcDay(now).toISOString().slice(0, 10)),
  ])
  // L'administrateur est traité comme abonné, sans quota de messages affiché.
  const plan = admin ? 'paid' : accessState.plan
  const daysLeft = trialDaysLeft(accessState, now)
  const access = {
    plan,
    trialDaysLeft: admin ? null : daysLeft,
    trialEndedRecently: admin ? false : accessState.trialEndedRecently,
    messagesToday,
    messagesPerDay: config.plans[plan].messagesPerDay,
    messagesMonth,
    messagesPerMonth: config.plans[plan].messagesPerMonth,
    // Offre de bienvenue : moitié prix le premier mois, pendant la fenêtre qui suit l'inscription.
    offer: admin ? null : currentOfferFor(user, config, now, plan),
    // Pub récompensée : seulement en gratuit, avec une régie configurée. Le crédit du jour s'ajoute au quota.
    ads: plan === 'free' && adProvider && config.ads.enabled ? { provider: adProvider, slot: adSlot ?? '', messagesPerVideo: config.ads.rewardMessages, videosLeft: Math.max(0, config.ads.maxVideosPerDay - rewards.videos), bonusToday: rewards.messages } : null,
  }

  // Une clé par conversation, et une clé neuve à chaque « nouvelle conversation » :
  // le composant est remonté, l'état du chat précédent ne fuit jamais dans le suivant.
  const shellKey = conversation?.id ?? `new-${crypto.randomUUID()}`

  return (
    <>
      <UtmCapture />
      <ChatSwitcher
        key={shellKey}
        chatKey={shellKey}
        app={publicApp}
        conversationId={conversation?.id ?? null}
        initialMessages={messages.map(toUIMessage)}
        initialFeedback={Object.fromEntries(messages.filter((m) => m.feedback).map((m) => [m.id, m.feedback as 'up' | 'down']))}
        conversations={conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, pinned: c.pinned }))}
        firstName={typeof profile.data.firstName === 'string' ? profile.data.firstName : null}
        access={access}
        pushEnabled={pushDevices > 0}
        autoPrompt={!conversation && asked ? asked.prompt : null}
      />
    </>
  )
}
