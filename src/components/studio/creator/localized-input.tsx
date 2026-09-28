'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SUPPORTED_LOCALES, type Locale } from '@/core/i18n/locale'

export type LocalizedValue = string | Partial<Record<Locale, string>>

export function asLocalized(value: LocalizedValue | undefined): Partial<Record<Locale, string>> {
  if (!value) return {}
  return typeof value === 'string' ? { en: value } : value
}

interface Props {
  label: string
  hint?: string
  value: LocalizedValue | undefined
  onChange: (next: Partial<Record<Locale, string>>) => void
  /** Langues à remplir : les autres onglets restent visibles mais grisés. */
  locales: readonly Locale[]
  multiline?: boolean
  maxLength?: number
  rows?: number
}

/**
 * Un champ texte en cinq langues, un onglet par langue. Un point sur l'onglet quand la langue
 * attendue est vide : le créateur voit d'un coup d'œil ce qui manque.
 */
export function LocalizedInput({ label, hint, value, onChange, locales, multiline = false, maxLength, rows = 3 }: Props) {
  const [tab, setTab] = useState<Locale>(locales[0] ?? 'en')
  const current = asLocalized(value)
  const set = (text: string) => onChange({ ...current, [tab]: text })
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div role="tablist" className="flex gap-1">
          {SUPPORTED_LOCALES.map((l) => {
            const wanted = locales.includes(l)
            const missing = wanted && !(current[l] ?? '').trim()
            return (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={tab === l}
                onClick={() => setTab(l)}
                className={`relative h-7 min-w-9 cursor-pointer rounded-md px-2 text-xs font-medium uppercase transition-colors ${tab === l ? 'bg-foreground text-background' : wanted ? 'bg-muted text-foreground hover:bg-muted/70' : 'text-muted-foreground/50'}`}
              >
                {l}
                {missing ? <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500" /> : null}
              </button>
            )
          })}
        </div>
      </div>
      {multiline ? (
        <Textarea rows={rows} maxLength={maxLength} value={current[tab] ?? ''} onChange={(e) => set(e.target.value)} lang={tab} />
      ) : (
        <Input maxLength={maxLength} value={current[tab] ?? ''} onChange={(e) => set(e.target.value)} lang={tab} className="h-10 rounded-lg" />
      )}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
