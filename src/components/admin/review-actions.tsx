'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { CreatorAppStatus } from '@/core/data/types'
import { REVIEW_CHECKLIST } from '@/core/studio/review'
import { L } from '@/lib/admin/labels'

/**
 * Les trois décisions de revue. Publier exige la liste entièrement cochée ; les deux autres
 * exigent un motif. Chaque décision part vers la route admin, qui journalise avant d'agir.
 */
export function ReviewActions({ slug, status }: { slug: string; status: CreatorAppStatus }) {
  const router = useRouter()
  const [checked, setChecked] = useState<boolean[]>(REVIEW_CHECKLIST.map(() => false))
  const [notes, setNotes] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const canApprove = ['submitted', 'in_review', 'changes_requested'].includes(status)
  const canSuspend = status === 'published'
  const canChanges = ['submitted', 'in_review', 'published'].includes(status)
  const allChecked = checked.every(Boolean)

  async function decide(body: Record<string, unknown>) {
    setPending(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/studio/${encodeURIComponent(slug)}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = (await res.json().catch(() => null)) as { data?: { email?: string }; error?: { message?: string } } | null
      if (!res.ok) {
        setMessage({ ok: false, text: `${L.actions.failed}${data?.error?.message ?? res.status}` })
        return
      }
      setMessage({ ok: true, text: `${L.actions.done} ${data?.data?.email === 'sent' ? L.studio.emailSent : L.studio.emailSkipped}` })
      setNotes('')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  const box = 'flex flex-col gap-3 rounded-2xl border border-black/[0.06] p-4 text-sm dark:border-white/[0.08]'

  return (
    <div className="flex flex-col gap-4">
      {message ? <p role="status" className={`text-sm ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{message.text}</p> : null}

      {canApprove ? (
        <div className={box}>
          <p className="font-medium">{L.studio.checklist}</p>
          <ol className="flex flex-col gap-2">
            {REVIEW_CHECKLIST.map((item, i) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={checked[i]} onChange={(e) => setChecked(checked.map((c, j) => (j === i ? e.target.checked : c)))} />
                  <span>{i + 1}. {item.label}</span>
                </label>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">{L.studio.shareFixed}</p>
          <p className="text-xs text-muted-foreground">{L.studio.approveHint}</p>
          <Button size="sm" className="self-start rounded-full text-white hover:opacity-90" style={{ background: '#5E5CE6' }} disabled={!allChecked || pending} onClick={() => void decide({ action: 'approve', checklist: checked })}>
            {L.studio.approve}
          </Button>
        </div>
      ) : null}

      {canChanges || canSuspend ? (
        <div className={box}>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{L.studio.notes}</span>
            <Textarea rows={4} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {canChanges ? (
              <Button size="sm" variant="outline" className="rounded-full" disabled={!notes.trim() || pending} onClick={() => void decide({ action: 'request_changes', notes })}>
                {L.studio.changes}
              </Button>
            ) : null}
            {canSuspend ? (
              <Button size="sm" variant="destructive" className="rounded-full" disabled={!notes.trim() || pending} onClick={() => void decide({ action: 'suspend', reason: notes })}>
                {L.studio.suspend}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{canSuspend ? L.studio.suspendHint : L.studio.changesHint}</p>
        </div>
      ) : null}
    </div>
  )
}
