'use client'

import { useState } from 'react'
import { Check, Clock3, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatActions } from '@/components/chat/chat-actions'
import { useI18n } from '@/lib/i18n/provider'

type Energy = 'low' | 'mid' | 'high'

export interface TaskCardData {
  task: { id: string; title: string; firstAction: string; energy: Energy; estimateMin: number | null; steps: { title: string; done: boolean }[] } | null
  empty: boolean
  openCount: number
}

export interface TasksCardData {
  created: { id: string; title: string; firstAction: string; energy: Energy; estimateMin: number | null }[]
  merged: string[]
  openCount: number
}

export interface StepsCardData {
  taskId: string
  title: string
  steps: { title: string; done: boolean }[]
  estimateMin: number | null
}

function EnergyBadge({ energy, minutes }: { energy: Energy; minutes: number | null }) {
  const { t, f } = useI18n()
  return (
    <span className="text-xs text-muted-foreground">
      {t.tasks.energy[energy]}
      {minutes ? ` · ${f(t.tasks.minutes, { minutes })}` : ''}
    </span>
  )
}

/** Une seule tâche, sa première action en grand, et trois issues : fait, plus tard, je jette. */
export function TaskCard({ data, active }: { data: TaskCardData; active: boolean }) {
  const { t, f } = useI18n()
  const actions = useChatActions()
  const [chosen, setChosen] = useState<string | null>(null)
  if (!data.task) {
    return <p className="rounded-2xl border border-dashed border-border p-3 text-sm text-muted-foreground">{data.empty ? t.tasks.nothingOpen : t.tasks.noneFits}</p>
  }
  const { task } = data
  const enabled = active && !chosen && actions !== null && !actions.busy
  async function choose(kind: 'done' | 'later' | 'drop') {
    if (!actions) return
    setChosen(kind)
    // La carte met la tâche à jour elle-même, avant d'envoyer : l'état ne dépend pas de ce que
    // le modèle fera du message. Lui n'a plus qu'à célébrer et proposer la suite.
    const status = kind === 'done' ? 'done' : kind === 'later' ? 'deferred' : 'dropped'
    await fetch(`/api/v1/${actions.appSlug}/tasks/${encodeURIComponent(task.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => undefined)
    const text = kind === 'done' ? t.tasks.donePrompt : kind === 'later' ? t.tasks.laterPrompt : t.tasks.dropPrompt
    actions.send(f(text, { title: task.title }))
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{task.title}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.tasks.firstAction}</p>
        <p className="text-lg font-semibold leading-snug">{task.firstAction}</p>
        <EnergyBadge energy={task.energy} minutes={task.estimateMin} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="rounded-full" disabled={!enabled} onClick={() => void choose('done')}>
          <Check data-icon="inline-start" />
          {t.tasks.done}
        </Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={!enabled} onClick={() => void choose('later')}>
          <Clock3 data-icon="inline-start" />
          {t.tasks.later}
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={!enabled} onClick={() => void choose('drop')}>
          <Trash2 data-icon="inline-start" />
          {t.tasks.drop}
        </Button>
      </div>
    </div>
  )
}

/**
 * Ce qu'un « vide ta tête » a gardé : la liste, courte, avec la première action de chacune,
 * ce qui existait déjà, et l'invitation à choisir. La carte dit tout : l'IA n'écrit rien après.
 */
export function TasksCard({ data, active }: { data: TasksCardData; active: boolean }) {
  const { t, f } = useI18n()
  const actions = useChatActions()
  const count = data.created.length
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{count === 1 ? t.tasks.keptOne : f(t.tasks.kept, { count })}</p>
      <ul className="flex flex-col gap-2">
        {data.created.map((task) => (
          <li key={task.id} className="flex flex-col">
            <span className="font-medium">{task.title}</span>
            <span className="text-sm text-muted-foreground">→ {task.firstAction}</span>
            <EnergyBadge energy={task.energy} minutes={task.estimateMin} />
          </li>
        ))}
      </ul>
      {data.merged.length ? <p className="text-xs text-muted-foreground">{f(t.tasks.merged, { titles: data.merged.join(', ') })}</p> : null}
      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <p className="text-sm text-muted-foreground">{t.tasks.startHint}</p>
        <Button size="sm" className="rounded-full" disabled={!active || !actions || actions.busy} onClick={() => actions?.send(t.tasks.pickPrompt)}>
          {t.tasks.pickForMe}
        </Button>
      </div>
    </div>
  )
}

/**
 * Étapes minuscules à cocher. Chaque case part vers la route des tâches sans passer par
 * l'IA ; quand la dernière est cochée, la carte envoie un message pour qu'elle célèbre.
 */
export function StepsCard({ data, active }: { data: StepsCardData; active: boolean }) {
  const { t, f } = useI18n()
  const actions = useChatActions()
  const [steps, setSteps] = useState(data.steps)
  const [celebrated, setCelebrated] = useState(false)
  const done = steps.filter((s) => s.done).length
  const enabled = actions !== null

  async function toggle(index: number) {
    if (!actions) return
    const next = steps.map((s, i) => (i === index ? { ...s, done: !s.done } : s))
    setSteps(next)
    await fetch(`/api/v1/${actions.appSlug}/tasks/${encodeURIComponent(data.taskId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stepIndex: index, done: next[index].done }),
    }).catch(() => undefined)
    if (active && !celebrated && next.every((s) => s.done)) {
      setCelebrated(true)
      actions.send(f(t.tasks.allDonePrompt, { title: data.title }))
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{data.title}</p>
        <span className="text-xs text-muted-foreground">{done === steps.length ? t.tasks.allDone : f(t.tasks.stepsDone, { done, total: steps.length })}</span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {steps.map((step, i) => (
          <li key={i}>
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 transition hover:bg-black/5 dark:hover:bg-white/10 ${step.done ? 'text-muted-foreground line-through' : ''}`}>
              <input type="checkbox" className="mt-1 size-4 accent-primary" checked={step.done} disabled={!enabled} onChange={() => void toggle(i)} />
              <span className="text-sm">{step.title}</span>
            </label>
          </li>
        ))}
      </ol>
    </div>
  )
}
