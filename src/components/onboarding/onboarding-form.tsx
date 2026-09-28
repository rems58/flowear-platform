'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { PublicOnboardingQuestion } from '@/apps/types'
import { errorMessage } from '@/lib/i18n/messages'
import { useI18n } from '@/lib/i18n/provider'
import type { PublicApp } from '@/lib/public-app'
import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Answers = Record<string, string | number | string[] | undefined>

function Question({ q, app, value, onChange }: { q: PublicOnboardingQuestion; app: PublicApp; value: Answers[string]; onChange: (v: Answers[string]) => void }) {
  const id = `q-${q.key}`
  switch (q.type) {
    case 'text':
      return (
        <label htmlFor={id} className="flex flex-col gap-2">
          <span className="font-medium">{q.label}</span>
          <Input id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={q.placeholder} maxLength={q.maxLength} required={q.required} autoComplete="off" />
        </label>
      )
    case 'number':
      return (
        <label htmlFor={id} className="flex flex-col gap-2">
          <span className="font-medium">{q.label}</span>
          <Input id={id} type="number" min={q.min} max={q.max} value={value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} required={q.required} />
        </label>
      )
    case 'choice':
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium">{q.label}</legend>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <label key={o.value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${value === o.value ? 'border-transparent text-white' : 'border-border hover:bg-muted'}`} style={value === o.value ? { background: `linear-gradient(135deg, ${app.brand.from}, ${app.brand.to})` } : undefined}>
                <input type="radio" name={q.key} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" required={q.required} />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      )
    case 'multi': {
      const selected = (value as string[] | undefined) ?? []
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium">{q.label}</legend>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => {
              const on = selected.includes(o.value)
              return (
                <label key={o.value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value].slice(0, q.max))}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              )
            })}
          </div>
        </fieldset>
      )
    }
  }
}

/** Onboarding : trois questions max, puis le chat. Les réponses deviennent le profil. */
export function OnboardingForm({ app }: { app: PublicApp }) {
  const router = useRouter()
  const { t } = useI18n()
  const [answers, setAnswers] = useState<Answers>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/${app.slug}/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
        setError(errorMessage(t, body?.error?.code, body?.error?.message ?? t.onboarding.saveFailed))
        return
      }
      router.refresh()
    } catch {
      setError(t.onboarding.connectionFailed)
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-8 px-6 py-12">
      <header className="flex flex-col items-center gap-3 text-center">
        <AppIcon brand={app.brand} size={96} />
        <p className="text-sm font-medium text-muted-foreground">{app.name}</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight">{app.tagline}</h1>
        {app.onboarding.intro ? <p className="text-muted-foreground">{app.onboarding.intro}</p> : null}
      </header>
      <form onSubmit={submit} className="flex flex-col gap-6 rounded-3xl bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_-12px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.04] dark:ring-white/10">
        {app.onboarding.questions.map((q) => (
          <Question key={q.key} q={q} app={app} value={answers[q.key]} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} />
        ))}
        {error ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="rounded-full" disabled={pending}>
          {pending ? t.onboarding.pending : t.onboarding.start}
        </Button>
      </form>
    </main>
  )
}
