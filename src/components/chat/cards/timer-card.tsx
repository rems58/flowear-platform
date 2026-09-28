'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { TimerReset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatActions } from '@/components/chat/chat-actions'
import { useI18n } from '@/lib/i18n/provider'

export interface TimerCardData {
  minutes: number
  task: string
  startedAt: string
  endsAt: string
}

/** Une seule horloge pour toutes les cartes : un instantané stable entre deux ticks. */
const clock = { now: Date.now(), listeners: new Set<() => void>(), id: 0 as number }
function subscribeClock(onChange: () => void): () => void {
  clock.listeners.add(onChange)
  if (clock.listeners.size === 1) {
    clock.now = Date.now()
    clock.id = window.setInterval(() => {
      clock.now = Date.now()
      for (const l of clock.listeners) l()
    }, 500)
  }
  return () => {
    clock.listeners.delete(onChange)
    if (clock.listeners.size === 0) window.clearInterval(clock.id)
  }
}

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Compte à rebours calé sur l'heure de fin du serveur (il survit à un rechargement). Quand
 * il sonne et que la carte est la dernière, le client envoie « ⏱ done » de la part de la
 * personne : l'IA reprend sans qu'elle ait rien à taper. Une fois passé, il reste affiché
 * comme terminé, sans rien renvoyer.
 */
export function TimerCard({ data, active }: { data: TimerCardData; active: boolean }) {
  const { t, f } = useI18n()
  const actions = useChatActions()
  const end = new Date(data.endsAt).getTime()
  // Horloge partagée, lue toutes les demi-secondes ; au rendu serveur, inconnue (null), pour
  // que le HTML du serveur et celui du navigateur soient identiques.
  const now = useSyncExternalStore(subscribeClock, () => clock.now, () => null)
  const remaining = now === null ? null : end - now
  const fired = useRef(false)

  useEffect(() => {
    if (remaining === null || remaining > 0 || fired.current || !active || !actions) return
    // Sonne seulement si la fin est récente : une carte rouverte le lendemain ne relance rien.
    if (Date.now() - end > 5 * 60_000) return
    fired.current = true
    try {
      navigator.vibrate?.([200, 100, 200])
    } catch {
      /* pas de vibreur */
    }
    actions.send(t.timer.donePrompt)
  }, [remaining, active, actions, end, t.timer.donePrompt])

  const finished = remaining !== null && remaining <= 0
  const progress = remaining === null ? 0 : Math.min(1, Math.max(0, 1 - remaining / (data.minutes * 60_000)))

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" role="timer" aria-live="off">
      <p className="text-sm text-muted-foreground">{f(t.timer.running, { minutes: data.minutes, task: data.task })}</p>
      <p className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{finished ? t.timer.finished : remaining === null ? format(data.minutes * 60_000) : format(remaining)}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
      </div>
      {!finished && active && actions ? (
        <Button size="sm" variant="outline" className="w-fit rounded-full" disabled={actions.busy} onClick={() => actions.send(t.timer.stopPrompt)}>
          <TimerReset data-icon="inline-start" />
          {t.timer.stop}
        </Button>
      ) : null}
    </div>
  )
}
