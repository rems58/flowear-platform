'use client'

import { useEffect, useState } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { useChatActions } from '@/components/chat/chat-actions'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/provider'
import { hasPushSubscription, subscribeToPush } from '@/lib/pwa/subscribe'

export interface CheckinCardData {
  id: string
  inMinutes?: number
  timeLocal: string
  days: number[] | null
  message: string
  /** Au moins un appareil de la personne est abonné (côté serveur). */
  pushEnabled: boolean
}

/**
 * Confirmation d'un rappel posé. Si cet appareil n'est pas abonné aux notifications, un
 * bouton l'abonne sur place : un rappel sans notification ne sert à rien, et la personne
 * n'a pas à aller chercher le réglage dans le menu.
 */
export function CheckinCard({ data }: { data: CheckinCardData }) {
  const { t, f, locale } = useI18n()
  const actions = useChatActions()
  const [device, setDevice] = useState<'unknown' | 'on' | 'off' | 'blocked' | 'unsupported'>('unknown')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    hasPushSubscription()
      .then((has) => {
        if (!alive) return
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') setDevice('blocked')
        else setDevice(has && data.pushEnabled ? 'on' : 'off')
      })
      .catch(() => alive && setDevice('unsupported'))
    return () => {
      alive = false
    }
  }, [data.pushEnabled])

  async function enable() {
    if (!actions) return
    setBusy(true)
    try {
      setDevice(await subscribeToPush(`/api/v1/${actions.appSlug}/push`, locale))
    } catch {
      setDevice('off')
    } finally {
      setBusy(false)
    }
  }

  const days = data.days ? data.days.map((d) => t.checkins.days[d - 1]).join(', ') : null
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 text-sm">
      <p className="inline-flex items-center gap-2 font-medium">
        <BellRing className="size-4" aria-hidden />
        {data.inMinutes ? f(t.checkins.scheduledIn, { minutes: data.inMinutes, time: data.timeLocal }) : days ? f(t.checkins.scheduledDays, { time: data.timeLocal, days }) : f(t.checkins.scheduled, { time: data.timeLocal })}
      </p>
      <p className="text-muted-foreground">« {data.message} »</p>
      {device === 'off' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">
          <span className="flex-1 text-xs">{data.pushEnabled ? t.checkins.enablePushHere : t.checkins.enablePush}</span>
          <Button type="button" size="sm" className="rounded-full" disabled={busy} onClick={() => void enable()}>
            <Bell data-icon="inline-start" />
            {t.push.enable}
          </Button>
        </div>
      ) : device === 'blocked' ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t.push.blocked}</p>
      ) : null}
    </div>
  )
}
