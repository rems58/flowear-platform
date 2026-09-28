'use client'

import { useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/provider'

interface FeedbackButtonsProps {
  appSlug: string
  messageId: string
  initial: 'up' | 'down' | null
}

/** Pouce haut ou bas sur une réponse. Un seul vote, modifiable. */
export function FeedbackButtons({ appSlug, messageId, initial }: FeedbackButtonsProps) {
  const { t } = useI18n()
  const [rating, setRating] = useState<'up' | 'down' | null>(initial)
  const [pending, setPending] = useState(false)

  async function vote(next: 'up' | 'down') {
    if (pending || rating === next) return
    setPending(true)
    const previous = rating
    setRating(next)
    try {
      const res = await fetch(`/api/v1/${appSlug}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId, rating: next }),
      })
      if (!res.ok) setRating(previous)
    } catch {
      setRating(previous)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-1" aria-label={t.feedback.question}>
      <Button type="button" variant="ghost" size="icon-xs" onClick={() => vote('up')} aria-pressed={rating === 'up'} aria-label={t.feedback.useful} className={rating === 'up' ? 'text-foreground' : 'text-muted-foreground'}>
        <ThumbsUp />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" onClick={() => vote('down')} aria-pressed={rating === 'down'} aria-label={t.feedback.notUseful} className={rating === 'down' ? 'text-foreground' : 'text-muted-foreground'}>
        <ThumbsDown />
      </Button>
    </div>
  )
}
