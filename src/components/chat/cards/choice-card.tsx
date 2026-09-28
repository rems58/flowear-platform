'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChatActions } from '@/components/chat/chat-actions'
import { useI18n } from '@/lib/i18n/provider'

export interface ChoiceCardData {
  question: string
  options: { value: string; label: string }[]
  saveAs: { kind: 'profile'; key: string } | { kind: 'note' } | { kind: 'none' } | { kind: 'assessment'; id: string; key: string }
  allowOther: boolean
  /** Au-dessus de la question : nom du questionnaire et « question n sur N ». */
  eyebrow?: string
  /** Texte d'introduction, première question d'un questionnaire. */
  intro?: string | null
}

/**
 * Question à choix : boutons, plus « autre » qui ouvre un champ libre. La réponse est
 * d'abord enregistrée par la route (profil ou note), puis envoyée au chat comme message.
 * Une carte qui n'est pas dans la dernière réponse est figée : on ne répond pas au passé.
 */
export function ChoiceCard({ data, active }: { data: ChoiceCardData; active: boolean }) {
  const { t } = useI18n()
  const actions = useChatActions()
  const [other, setOther] = useState(false)
  const [text, setText] = useState('')
  const [answered, setAnswered] = useState<string | null>(null)
  const enabled = active && !answered && actions !== null && !actions.busy

  async function answer(label: string, value?: string) {
    if (!actions) return
    setAnswered(label)
    if (data.saveAs.kind !== 'none') {
      // L'enregistrement précède l'envoi : même si l'IA oublie, la réponse est gardée.
      // Pour un questionnaire, c'est la valeur de l'option qui compte, pas son libellé.
      const saveAs = data.saveAs.kind === 'assessment' ? { ...data.saveAs, value: value ?? label } : data.saveAs
      await fetch(`/api/v1/${actions.appSlug}/choice`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: data.question, answer: label, saveAs }),
      }).catch(() => undefined)
    }
    actions.send(label)
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
      {data.eyebrow ? <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{data.eyebrow}</p> : null}
      {data.intro ? <p className="text-sm text-muted-foreground">{data.intro}</p> : null}
      <p className="text-sm font-medium">{data.question}</p>
      <div className="flex flex-wrap gap-2">
        {data.options.map((o) => (
          <Button key={o.value} size="sm" variant={answered === o.label ? 'default' : 'outline'} className="rounded-full" disabled={!enabled} onClick={() => void answer(o.label, o.value)}>
            {o.label}
          </Button>
        ))}
        {data.allowOther ? (
          <Button size="sm" variant={other ? 'secondary' : 'ghost'} className="rounded-full" disabled={!enabled} onClick={() => setOther((v) => !v)} aria-expanded={other}>
            {t.choice.other}
          </Button>
        ) : null}
      </div>
      {other && enabled ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) void answer(text.trim().slice(0, 200))
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.choice.otherPlaceholder} maxLength={200} className="h-9" autoFocus aria-label={t.choice.otherPlaceholder} />
          <Button type="submit" size="sm" className="rounded-full" disabled={!text.trim()}>
            {t.choice.send}
          </Button>
        </form>
      ) : null}
    </div>
  )
}
