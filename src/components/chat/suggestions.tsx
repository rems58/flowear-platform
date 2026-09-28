'use client'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/provider'

interface SuggestionsProps {
  items: { label: string; prompt: string }[]
  /** Textes déjà envoyés dans cette conversation : leurs suggestions ne se répètent pas. */
  sent: readonly string[]
  disabled: boolean
  onPick: (prompt: string) => void
}

/**
 * Suggestions à droite du fil, comme des messages de la personne en attente d'être envoyés,
 * grisées. Un clic envoie le texte tel quel. À l'ouverture, elles sont la porte d'entrée ;
 * après une réponse, elles rappellent ce qu'on peut faire d'autre.
 */
export function Suggestions({ items, sent, disabled, onPick }: SuggestionsProps) {
  const { t } = useI18n()
  const used = new Set(sent.map((s) => s.trim().toLowerCase()))
  const visible = items.filter((s) => !used.has(s.prompt.trim().toLowerCase()))
  if (visible.length === 0) return null
  return (
    <div className="flex flex-wrap justify-end gap-2" aria-label={t.chat.suggestions}>
      {visible.map((s) => (
        <Button
          key={s.prompt}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onPick(s.prompt)}
          className="h-auto max-w-[85%] whitespace-normal rounded-3xl rounded-br-lg border-dashed px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
        >
          {s.label}
        </Button>
      ))}
    </div>
  )
}
