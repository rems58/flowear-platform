'use client'

import { useState } from 'react'
import { PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { showRewardedAd } from '@/lib/ads/rewarded'
import { fmt } from '@/lib/i18n/messages'
import { useI18n } from '@/lib/i18n/provider'

interface RewardedButtonProps {
  appSlug: string
  ads: { provider: 'gam'; slot: string; messagesPerVideo: number; videosLeft: number }
  /** Vidéos déjà regardées dans cette session (le serveur ne le sait qu'après rechargement). */
  earnedVideos: number
  onEarned: (messages: number) => void
}

/**
 * « Regarde une vidéo, gagne des messages ». Le serveur réserve un nonce, la régie joue la
 * vidéo, le serveur confirme et crédite le jour. Si la personne ferme avant la fin, rien.
 */
export function RewardedButton({ appSlug, ads, earnedVideos, onEarned }: RewardedButtonProps) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const left = Math.max(0, ads.videosLeft - earnedVideos)
  if (left <= 0) return <span className="text-xs text-muted-foreground">{t.ads.noneLeft}</span>

  async function watch() {
    setBusy(true)
    setError(null)
    try {
      const start = await fetch(`/api/v1/${appSlug}/reward`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: 'start' }) })
      const started = (await start.json().catch(() => null)) as { data?: { nonce: string } } | null
      if (!start.ok || !started?.data) throw new Error('start')
      const ok = await showRewardedAd(ads.provider, ads.slot)
      if (!ok) {
        setError(t.ads.notFinished)
        return
      }
      const done = await fetch(`/api/v1/${appSlug}/reward`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: 'complete', nonce: started.data.nonce }) })
      const result = (await done.json().catch(() => null)) as { data?: { messages: number } } | null
      if (!done.ok || !result?.data) throw new Error('complete')
      onEarned(result.data.messages)
    } catch {
      setError(t.ads.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => void watch()}>
        <PlayCircle data-icon="inline-start" />
        {fmt(t.ads.watch, { messages: ads.messagesPerVideo, left })}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  )
}
