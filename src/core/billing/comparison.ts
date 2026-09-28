import type { AppDefinition } from '@/apps/types'
import { resolveConfig } from '@/core/config/resolve'
import type { AppSetting } from '@/core/config/schema'
import type { Locale } from '@/core/i18n/locale'
import { getMessages } from '@/lib/i18n/messages'

export interface ComparisonRow {
  key: string
  label: string
  free: string
  paid: string
  /** Vrai si le gratuit est bridé sur cette ligne (mise en avant). */
  locked: boolean
}

/**
 * Le tableau gratuit contre payant d'une IA, déduit de sa configuration : les lignes bridées
 * (messages, modèle, productions, recherche web, seulement si l'IA a l'outil) puis ce qui reste
 * ouvert (ce que l'IA propose vraiment). Jamais écrit à la main : il suit les réglages et le
 * manifeste, donc il est juste pour chaque IA et à chaque changement de plan.
 */
export function buildComparison(app: AppDefinition, settings: AppSetting[], locale: Locale): ComparisonRow[] {
  const t = getMessages(locale).pricing.compare
  const config = resolveConfig(app, settings)
  const free = config.plans.free
  const paid = config.plans.paid
  const tools = new Set(app.tools.enabled)
  const rows: ComparisonRow[] = []
  const n = (v: number) => new Intl.NumberFormat(locale).format(v)

  rows.push({ key: 'messages', label: t.messages, free: t.perDay.replace('{count}', n(free.messagesPerDay)), paid: t.perDay.replace('{count}', n(paid.messagesPerDay)), locked: free.messagesPerDay < paid.messagesPerDay })
  rows.push({ key: 'model', label: t.model, free: free.modelTier === 'big' ? t.modelBig : t.modelSmall, paid: paid.modelTier === 'big' ? t.modelBig : t.modelSmall, locked: free.modelTier !== paid.modelTier })
  if (tools.has('create_fiche') || tools.has('create_comparatif')) {
    rows.push({ key: 'artifacts', label: t.artifacts, free: free.artifactsPerMonth === 0 ? t.artifactsNone : t.perMonth.replace('{count}', n(free.artifactsPerMonth)), paid: t.perMonth.replace('{count}', n(paid.artifactsPerMonth)), locked: free.artifactsPerMonth < paid.artifactsPerMonth })
  }
  if (tools.has('search_web')) {
    rows.push({ key: 'web', label: t.web, free: free.webSearch ? t.yes : t.no, paid: paid.webSearch ? t.yes : t.no, locked: !free.webSearch && paid.webSearch })
  }
  if (tools.has('schedule_checkin')) {
    const reminders = (c: number) => (c === 1 ? t.remindersOne : t.remindersCount.replace('{count}', n(c)))
    rows.push({ key: 'reminders', label: t.remindersLabel, free: reminders(free.checkinsActive), paid: reminders(paid.checkinsActive), locked: free.checkinsActive < paid.checkinsActive })
  }
  if (app.assessments.length) {
    rows.push({ key: 'retake', label: t.retake, free: free.assessmentRetake ? t.yes : t.retakeOnce, paid: paid.assessmentRetake ? t.yes : t.retakeOnce, locked: !free.assessmentRetake && paid.assessmentRetake })
  }
  // Ce qui reste ouvert, dans les deux plans : dit pour ne pas laisser croire que tout se ferme.
  const open: string[] = [t.memory]
  if (app.tasks.enabled) open.push(t.tasks)
  if (tools.has('focus_timer')) open.push(t.timer)
  if (app.assessments.length) open.push(t.assessmentsFirst)
  open.push(t.voice)
  rows.push({ key: 'open', label: open.join(', '), free: t.yes, paid: t.yes, locked: false })
  return rows
}
