'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { STUDIO_AUDIENCE_MAX, STUDIO_IDEA_MAX, showWaitlistCount } from '@/core/studio/waitlist'
import { useI18n } from '@/lib/i18n/provider'

/** Formulaire de la liste d'attente : email, idée, audience. Le compteur se met à jour à l'envoi. */
export function StudioForm({ initialCount }: { initialCount: number }) {
  const { t, f, locale } = useI18n()
  const [email, setEmail] = useState('')
  const [idea, setIdea] = useState('')
  const [audience, setAudience] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'exists' | 'failed'>('idle')
  const [count, setCount] = useState(initialCount)
  const [linked, setLinked] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    try {
      const res = await fetch('/api/studio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, idea, audience: audience || undefined, locale }),
      })
      const body = (await res.json().catch(() => null)) as { data?: { result?: 'added' | 'exists'; count?: number; linked?: boolean } } | null
      if (!res.ok || !body?.data?.result) {
        setState('failed')
        return
      }
      if (typeof body.data.count === 'number') setCount(body.data.count)
      setLinked(body.data.linked === true)
      setState(body.data.result === 'added' ? 'done' : 'exists')
    } catch {
      setState('failed')
    }
  }

  const ready = email.includes('@') && idea.trim().length > 0 && state !== 'sending'

  return (
    <form onSubmit={(e) => void submit(e)} className="flex w-full flex-col gap-4 rounded-[1.25rem] p-5 sm:p-6">
      {state === 'done' || state === 'exists' ? (
        <div role="status" className="flex flex-col gap-3">
          <p className="text-base font-medium">{state === 'done' ? t.studio.done : t.studio.exists}</p>
          {linked ? (
            <p className="text-sm">{t.studio.linked}</p>
          ) : (
            <>
              <p className="text-sm">{f(t.studio.finish, { email })}</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/sign-up?redirect_url=/studio" className="inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white hover:opacity-90" style={{ background: '#5E5CE6' }}>
                  {t.studio.finishCta}
                </Link>
                <Link href="/sign-in?redirect_url=/studio" className="inline-flex h-10 items-center rounded-full border border-current/20 px-5 text-sm font-medium hover:opacity-80">
                  {t.studio.finishSignIn}
                </Link>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t.studio.email}
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t.studio.idea}
            <Textarea required maxLength={STUDIO_IDEA_MAX} rows={3} placeholder={t.studio.ideaPlaceholder} value={idea} onChange={(e) => setIdea(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t.studio.audience}
            <Input maxLength={STUDIO_AUDIENCE_MAX} placeholder={t.studio.audiencePlaceholder} value={audience} onChange={(e) => setAudience(e.target.value)} className="h-11 rounded-xl" />
          </label>
          <Button type="submit" size="lg" className="h-11 rounded-full text-white hover:opacity-90" style={{ background: '#5E5CE6' }} disabled={!ready}>
            {state === 'sending' ? t.studio.sending : t.studio.send}
          </Button>
          {state === 'failed' ? <p role="alert" className="text-sm text-destructive">{t.studio.failed}</p> : null}
        </>
      )}
      {showWaitlistCount(count) ? <p className="text-sm text-muted-foreground">{f(t.studio.count, { n: count })}</p> : null}
    </form>
  )
}
