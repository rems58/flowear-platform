'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TOOL_REQUEST_STATUSES, type ToolRequestStatus } from '@/core/studio/economics'
import { L } from '@/lib/admin/labels'

/** Le statut d'une demande d'outil, changé d'un clic, journalisé par la route. */
export function ToolRequestStatus({ slug, id, status }: { slug: string; id: string; status: ToolRequestStatus }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  async function change(next: ToolRequestStatus) {
    setPending(true)
    try {
      await fetch(`/api/admin/studio/${encodeURIComponent(slug)}/tools`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: next }) })
      router.refresh()
    } finally {
      setPending(false)
    }
  }
  return (
    <select value={status} disabled={pending} onChange={(e) => void change(e.target.value as ToolRequestStatus)} className="h-8 rounded-lg border border-input bg-background px-2 text-xs">
      {TOOL_REQUEST_STATUSES.map((s) => (
        <option key={s} value={s}>{L.studio.toolStatus[s]}</option>
      ))}
    </select>
  )
}
