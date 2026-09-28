'use client'

import { Button } from '@/components/ui/button'

/** Puces de catégorie, une seule sélectionnable : le « pourquoi » d'un signalement. */
export function CategoryChips<T extends string>({ options, value, onChange, labels, label }: { options: readonly T[]; value: T | null; onChange: (v: T) => void; labels: Record<T, string>; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((c) => (
        <Button key={c} type="button" size="xs" variant={value === c ? 'default' : 'outline'} className="rounded-full" role="radio" aria-checked={value === c} onClick={() => onChange(c)}>
          {labels[c]}
        </Button>
      ))}
    </div>
  )
}
