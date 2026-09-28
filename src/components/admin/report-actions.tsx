'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { L } from '@/lib/admin/labels'

/** Boutons d'un signalement : vu, résolu avec note. La page se recharge après l'action. */
export function ReportActions({ id, status }: { id: string; status: 'new' | 'seen' | 'resolved' }) {
  const router = useRouter()
  const [resolution, setResolution] = useState('')
  const [pending, setPending] = useState(false)
  const [resolving, setResolving] = useState(false)

  async function patch(next: 'seen' | 'resolved') {
    setPending(true)
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next, resolution: next === 'resolved' && resolution.trim() ? resolution.trim() : undefined }),
      })
      if (res.ok) router.refresh()
    } finally {
      setPending(false)
      setResolving(false)
    }
  }

  if (status === 'resolved') return null
  return (
    <div className="flex flex-col gap-2">
      {resolving ? (
        <Textarea value={resolution} onChange={(e) => setResolution(e.target.value.slice(0, 1000))} placeholder={L.inbox.resolutionPlaceholder} rows={2} className="text-sm" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {status === 'new' ? (
          <Button size="sm" variant="outline" className="rounded-full" disabled={pending} onClick={() => patch('seen')}>
            {L.inbox.markSeen}
          </Button>
        ) : null}
        <Button size="sm" className="rounded-full" disabled={pending} onClick={() => (resolving ? patch('resolved') : setResolving(true))}>
          {L.inbox.resolve}
        </Button>
      </div>
    </div>
  )
}
