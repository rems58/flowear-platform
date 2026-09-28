'use client'

import type { UIMessage } from 'ai'
import { Wrench } from 'lucide-react'
import { AssessmentCard, type AssessmentCardData } from './cards/assessment-card'
import { HelplineCard, type HelplineCardData } from './cards/helpline-card'
import { CheckinCard, type CheckinCardData } from './cards/checkin-card'
import { ChoiceCard, type ChoiceCardData } from './cards/choice-card'
import { ComparatifCard, type ComparatifCardData } from './cards/comparatif-card'
import { FicheCard, type FicheCardData } from './cards/fiche-card'
import { StepsCard, TaskCard, TasksCard, type StepsCardData, type TaskCardData, type TasksCardData } from './cards/task-cards'
import { TimerCard, type TimerCardData } from './cards/timer-card'
import { FeedbackButtons } from './feedback-buttons'
import { Markdown } from './markdown'
import { ReportButton } from './report-button'
import { useI18n } from '@/lib/i18n/provider'

interface MessageItemProps {
  message: UIMessage
  brand: { from: string; to: string; glyph: string }
  appSlug: string
  appName: string
  initialFeedback: 'up' | 'down' | null
  /** Réponse encore en cours : pas de retour possible tant qu'elle n'est pas enregistrée. */
  pending?: boolean
  /** Dernière réponse du fil : seules ses cartes (choix, tâche, minuteur) restent actives. */
  last?: boolean
}

type ToolPart = { type: string; state?: string; output?: unknown; errorText?: string }

function ToolPartView({ part, appName, active }: { part: ToolPart; appName: string; active: boolean }) {
  const { t, f } = useI18n()
  const name = part.type.replace(/^tool-/, '')
  // Libellé connu (create_fiche, save_note...) sinon formule générique avec le nom du tool.
  const known = (t.toolChips as Record<string, string>)[name]
  const unavailable = f(t.toolChips.unavailable, { name })
  if (part.state === 'output-available' && part.output && typeof part.output === 'object') {
    const output = part.output as Record<string, unknown>
    // Refus silencieux (rien à ranger) : la réponse en texte suffit, pas de bandeau.
    if (output.error) return output.silent ? null : <ToolChip text={unavailable} />
    if (name === 'create_fiche') return <FicheCard data={output as unknown as FicheCardData} />
    if (name === 'create_comparatif') return <ComparatifCard data={output as unknown as ComparatifCardData} />
    if (name === 'ask_choice') return <ChoiceCard data={output as unknown as ChoiceCardData} active={active} />
    if (name === 'assessment') {
      if (output.kind === 'result') return <AssessmentCard data={output as unknown as AssessmentCardData} active={active} />
      const q = output as { assessmentId: string; name: string; intro: string | null; index: number; total: number; question: string; key: string; options: { value: string; label: string }[] }
      return (
        <ChoiceCard
          data={{ question: q.question, options: q.options, saveAs: { kind: 'assessment', id: q.assessmentId, key: q.key }, allowOther: false, eyebrow: `${q.name} · ${f(t.assessment.progress, { index: q.index, total: q.total })}`, intro: q.intro }}
          active={active}
        />
      )
    }
    if (name === 'focus_timer') return <TimerCard data={output as unknown as TimerCardData} active={active} />
    if (name === 'next_action') return <TaskCard data={output as unknown as TaskCardData} active={active} />
    if (name === 'brain_dump') return <TasksCard data={output as unknown as TasksCardData} active={active} />
    if (name === 'break_down') return <StepsCard data={output as unknown as StepsCardData} active={active} />
    if (name === 'schedule_checkin') return <CheckinCard data={output as unknown as CheckinCardData} />
    if (name === 'helpline') return <HelplineCard data={output as unknown as HelplineCardData} />
    return <ToolChip text={`${appName} ${known ?? f(t.toolChips.used, { name })}.`} />
  }
  if (part.state === 'output-error') return <ToolChip text={unavailable} />
  return <ToolChip text={`${appName} ${known ?? f(t.toolChips.using, { name })}…`} pending />
}

function ToolChip({ text, pending = false }: { text: string; pending?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground ${pending ? 'animate-pulse' : ''}`}>
      <Wrench className="size-3" aria-hidden />
      {text}
    </span>
  )
}

/** Un message : bulle utilisateur, ou réponse avec Markdown, cartes d'outils et retour. */
export function MessageItem({ message, brand, appSlug, appName, initialFeedback, pending = false, last = false }: MessageItemProps) {
  if (message.role === 'user') {
    const text = message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
    return (
      <div className="flex justify-end">
        <p
          className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg px-4 py-2.5 text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${brand.from}, ${brand.to})` }}
        >
          {text}
        </p>
      </div>
    )
  }

  const hasText = message.parts.some((p) => p.type === 'text' && (p as { text: string }).text.trim())
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {message.parts.map((part, i) => {
          if (part.type === 'text') return <Markdown key={i} text={(part as { text: string }).text} />
          if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') return <ToolPartView key={i} part={part as ToolPart} appName={appName} active={last && !pending} />
          return null
        })}
      </div>
      {hasText && !pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <FeedbackButtons appSlug={appSlug} messageId={message.id} initial={initialFeedback} />
          <ReportButton appSlug={appSlug} messageId={message.id} />
        </div>
      ) : null}
    </div>
  )
}
