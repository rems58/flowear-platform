'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PLAN_LIMIT_KEYS } from '@/core/admin/settings'
import type { AppSetting } from '@/core/config/schema'
import { L } from '@/lib/admin/labels'

export interface AppSettingsView {
  slug: string
  name: string
  /** Outils déclarés par le manifeste, avec leur état une fois les réglages appliqués. */
  tools: { name: string; enabled: boolean }[]
  /** Valeur effective et valeur de base, par plan et par plafond. */
  plans: Record<'free' | 'paid', Record<(typeof PLAN_LIMIT_KEYS)[number], { effective: number; base: number; own: boolean }>>
}

type PlanKey = (typeof PLAN_LIMIT_KEYS)[number]

/**
 * Réglages d'une IA : interrupteurs d'outils et plafonds de plan. Chaque changement part
 * seul vers la route, qui l'essaie à blanc avant de l'écrire. Un refus s'affiche tel quel.
 */
export function SettingsForm({ app }: { app: AppSettingsView }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  async function write(setting: AppSetting): Promise<void> {
    setPending(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(setting) })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setMessage({ ok: false, text: `${L.settings.failed}${body?.error?.message ?? res.status}` })
        return
      }
      setMessage({ ok: true, text: L.settings.saved })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  async function remove(key: string): Promise<void> {
    setPending(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/settings', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: [app.slug], key }) })
      setMessage(res.ok ? { ok: true, text: L.settings.saved } : { ok: false, text: `${L.settings.failed}${res.status}` })
      if (res.ok) router.refresh()
    } finally {
      setPending(false)
    }
  }

  function toggleTool(name: string, enabled: boolean) {
    // `tools.disabled` est une liste par IA : on la recompose entière à chaque clic.
    const disabled = app.tools.filter((t) => (t.name === name ? enabled : !t.enabled)).map((t) => t.name)
    void write({ scope: [app.slug], key: 'tools.disabled', value: disabled })
  }

  return (
    <div className="flex flex-col gap-5">
      {message ? (
        <p role="status" className={`text-sm ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
          {message.text}
        </p>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{L.settings.tools}</p>
        <div className="flex flex-wrap gap-2">
          {app.tools.map((t) => (
            <Button key={t.name} size="sm" variant={t.enabled ? 'default' : 'outline'} className="rounded-full font-mono text-xs" disabled={pending} onClick={() => toggleTool(t.name, t.enabled)} aria-pressed={t.enabled}>
              {t.name} · {t.enabled ? L.settings.toolOn : L.settings.toolOff}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{L.settings.plans}</p>
        <div className="grid gap-4 md:grid-cols-2">
          {(['free', 'paid'] as const).map((plan) => (
            <div key={plan} className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
              <p className="mb-3 font-semibold">{L.settings[plan]}</p>
              <div className="flex flex-col gap-2">
                {PLAN_LIMIT_KEYS.map((key: PlanKey) => {
                  const { effective, base, own } = app.plans[plan][key]
                  const settingKey = `plans.${plan}.${key}`
                  const draft = drafts[settingKey] ?? String(effective)
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-muted-foreground">{L.settings[key]}</span>
                      <Input type="number" min={0} step={key.startsWith('maxUsd') ? 0.01 : 1} value={draft} onChange={(e) => setDrafts((d) => ({ ...d, [settingKey]: e.target.value }))} className="h-8 w-24 text-right text-sm" aria-label={L.settings[key]} />
                      <Button size="xs" variant="outline" className="rounded-full" disabled={pending || Number(draft) === effective} onClick={() => write({ scope: [app.slug], key: settingKey, value: Number(draft) })}>
                        {L.settings.save}
                      </Button>
                      {own ? (
                        <Button size="xs" variant="ghost" className="rounded-full text-muted-foreground" disabled={pending} onClick={() => remove(settingKey)} title={`${L.settings.default} : ${base}`}>
                          {L.settings.reset}
                        </Button>
                      ) : effective !== base ? (
                        <span className="text-xs text-muted-foreground" title={`${L.settings.default} : ${base}`}>
                          {L.settings.scopeAll}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
