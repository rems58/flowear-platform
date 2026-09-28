'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { L } from '@/lib/admin/labels'

/**
 * Le questionnaire que Flowear construit à partir de la description du créateur : JSON du
 * schéma `assessment` (source obligatoire), vérifié par la route avant d'entrer dans le brouillon.
 */
export function AssessmentBuilder({ slug, initial }: { slug: string; initial: string }) {
  const router = useRouter()
  const [text, setText] = useState(initial)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function save(clear: boolean) {
    let assessments: unknown = null
    if (!clear) {
      try {
        assessments = JSON.parse(text)
      } catch {
        setMessage({ ok: false, text: L.studio.assessmentJsonInvalid })
        return
      }
    }
    setPending(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/studio/${encodeURIComponent(slug)}/assessment`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assessments }) })
      const body = (await res.json().catch(() => null)) as { error?: { message?: string; details?: { issues?: { path: string; message: string }[] } } } | null
      if (!res.ok) {
        const issues = body?.error?.details?.issues?.map((i) => `${i.path} : ${i.message}`).join(' ; ')
        setMessage({ ok: false, text: `${L.actions.failed}${issues || body?.error?.message || res.status}` })
        return
      }
      setMessage({ ok: true, text: L.actions.done })
      if (clear) setText('')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{L.studio.assessmentBuildHint}</p>
      <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" spellCheck={false} />
      <div className="flex gap-2">
        <Button size="sm" className="rounded-full" disabled={pending || !text.trim()} onClick={() => void save(false)}>{L.studio.assessmentSave}</Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={pending} onClick={() => void save(true)}>{L.studio.assessmentClear}</Button>
      </div>
      {message ? <p role="status" className={`text-sm ${message.ok ? 'text-emerald-600' : 'text-destructive'}`}>{message.text}</p> : null}
    </div>
  )
}
