'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CATEGORY_IDS } from '@/apps/types'
import type { CreatorApp, CreatorKnowledgeFile, CreatorRequests } from '@/core/data/types'
import { SUPPORTED_LOCALES, type Locale } from '@/core/i18n/locale'
import { KNOWLEDGE_MAX_BYTES, KNOWLEDGE_MAX_FILES, PERSONA_MAX, PERSONA_MIN, runManifestChecks, type CheckResult } from '@/core/studio/checks'
import { ASSESSMENT_BRIEF_MAX, STUDIO_TERMS_VERSION, emptyManifest } from '@/core/studio/draft'
import { CREATOR_TOOL_ALLOWLIST } from '@/core/studio/manifest'
import type { CreatorDashboard } from '@/core/studio/dashboard'
import type { ToolRequest } from '@/core/data/types'
import { useI18n } from '@/lib/i18n/provider'
import { ChecksPanel } from './checks-panel'
import { LocalizedInput, asLocalized, type LocalizedValue } from './localized-input'
import { LogoPicker } from './logo-picker'
import { SandboxChat } from './sandbox-chat'

type Manifest = Record<string, unknown>
type Question = { type: 'text' | 'choice' | 'multi' | 'number'; key: string; label?: LocalizedValue; options?: { value: string; label?: LocalizedValue }[] }
type Suggestion = { label?: LocalizedValue; prompt?: LocalizedValue }

const SECTIONS = ['dashboard', 'identity', 'persona', 'onboarding', 'knowledge', 'tools', 'suggestions', 'assessment', 'sandbox', 'submit'] as const
type Section = (typeof SECTIONS)[number]

const STATUS_KEY: Record<CreatorApp['status'], 'statusDraft' | 'statusSubmitted' | 'statusInReview' | 'statusChanges' | 'statusPublished' | 'statusSuspended'> = {
  draft: 'statusDraft',
  submitted: 'statusSubmitted',
  in_review: 'statusInReview',
  changes_requested: 'statusChanges',
  published: 'statusPublished',
  suspended: 'statusSuspended',
}

/** Nom du fichier unique du mode simple des connaissances : un texte, découpé par Flowear. */
const SIMPLE_KNOWLEDGE_NAME = 'savoir'

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/**
 * L'espace créateur : un seul écran, neuf sections, sauvegarde automatique, règles évaluées
 * pendant la saisie (même code que le serveur), aperçu de l'icône, bac à sable, soumission.
 * Zéro logique métier ici : les règles vivent dans `src/core/studio`, l'écran les affiche.
 */
export function CreatorEditor({ initial, initialChecks, dashboard }: { initial: CreatorApp | null; initialChecks: CheckResult[]; dashboard: CreatorDashboard | null }) {
  const { t, f, locale } = useI18n()
  const [app, setApp] = useState<CreatorApp | null>(initial)
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugRemote, setSlugRemote] = useState<{ slug: string; status: 'available' | 'taken' | 'reserved' | 'invalid' } | null>(null)
  const [manifest, setManifest] = useState<Manifest>((initial?.manifest as Manifest) ?? {})
  const [knowledge, setKnowledge] = useState<CreatorKnowledgeFile[]>(initial?.knowledge ?? [])
  const [assessmentText, setAssessmentText] = useState(() => (initial?.manifest.assessments ? JSON.stringify(initial.manifest.assessments, null, 2) : ''))
  const [assessmentError, setAssessmentError] = useState(false)
  const [requests, setRequests] = useState<CreatorRequests>(initial?.requests ?? {})
  // Modes : simple par défaut, avancé si le brouillon utilise déjà la forme technique.
  const [logoMode, setLogoMode] = useState<'letter' | 'image'>(initial?.manifest.brand?.image ? 'image' : 'letter')
  const [knowledgeMode, setKnowledgeMode] = useState<'simple' | 'advanced'>(() => {
    const k = initial?.knowledge ?? []
    return k.length === 0 || (k.length === 1 && k[0].name === SIMPLE_KNOWLEDGE_NAME) ? 'simple' : 'advanced'
  })
  const [assessmentMode, setAssessmentMode] = useState<'simple' | 'advanced'>(initial?.manifest.assessments?.length && !initial?.requests?.assessment ? 'advanced' : 'simple')
  // Description gardée de côté pendant le mode avancé : en avancé, c'est le créateur qui tient le JSON.
  const [parkedBrief, setParkedBrief] = useState<string | undefined>(undefined)
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [section, setSection] = useState<Section>(initial ? 'dashboard' : 'identity')
  const [toolRequests, setToolRequests] = useState<ToolRequest[]>(dashboard?.toolRequests ?? [])
  const [toolTitle, setToolTitle] = useState('')
  const [toolBody, setToolBody] = useState('')
  const [toolState, setToolState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  const [terms, setTerms] = useState(false)
  const [site, setSite] = useState('')
  const [submit, setSubmit] = useState<'idle' | 'sending' | 'done' | 'checks' | 'error'>('idle')
  const [serverChecks, setServerChecks] = useState<CheckResult[]>(initialChecks)
  const dirty = useRef(false)

  const locked = app ? ['submitted', 'in_review'].includes(app.status) : false
  const locales = (arr<Locale>(manifest.locales).length ? arr<Locale>(manifest.locales) : [...SUPPORTED_LOCALES]) as Locale[]
  const brand = obj(manifest.brand)
  const preview = { from: str(brand.from) || '#5E5CE6', to: str(brand.to) || '#3F3DB8', glyph: str(brand.glyph) || 'A', ...(logoMode === 'image' && str(brand.image) ? { image: str(brand.image) } : {}) }
  const results = useMemo(() => (app ? runManifestChecks({ manifest: manifest as never, knowledge, allowedHosts: site ? [site] : [] }) : []), [app, manifest, knowledge, site])
  const localChecksPass = results.every((r) => r.ok)
  const scenarioChecks = serverChecks.filter((c) => c.check === 'scenario' || c.check === 'cost_probe')

  const patch = useCallback((next: Partial<Manifest>) => {
    dirty.current = true
    setManifest((m) => ({ ...m, ...next }))
  }, [])

  // Sauvegarde automatique, une seconde et demie après la dernière frappe.
  useEffect(() => {
    if (!app || locked || !dirty.current) return
    const timer = setTimeout(async () => {
      dirty.current = false
      setSave('saving')
      try {
        const res = await fetch('/api/studio/app', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: app.slug, manifest, knowledge, requests }) })
        setSave(res.ok ? 'saved' : 'failed')
      } catch {
        setSave('failed')
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [app, locked, manifest, knowledge, requests])

  // Disponibilité du slug, vérifiée en direct avant la création : le format se juge ici, le reste au serveur.
  const slugFormat = !slug ? 'idle' : /^[a-z0-9-]{2,32}$/.test(slug) ? 'ok' : 'invalid'
  const slugStatus: 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid' =
    slugFormat === 'idle' ? 'idle' : slugFormat === 'invalid' ? 'invalid' : slugRemote?.slug === slug ? slugRemote.status : 'checking'
  useEffect(() => {
    if (app || slugFormat !== 'ok') return
    const wanted = slug
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/studio/app/slug?slug=${encodeURIComponent(wanted)}`)
        const body = (await res.json()) as { data?: { status?: 'available' | 'taken' | 'reserved' | 'invalid' } }
        setSlugRemote({ slug: wanted, status: body.data?.status ?? 'invalid' })
      } catch {
        setSlugRemote({ slug: wanted, status: 'invalid' })
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [slug, slugFormat, app])

  async function create() {
    const m = emptyManifest(slug) as unknown as Manifest
    const res = await fetch('/api/studio/app', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, manifest: m, knowledge: [] }) })
    const body = (await res.json().catch(() => null)) as { data?: { app?: CreatorApp } } | null
    if (res.ok && body?.data?.app) {
      setApp(body.data.app)
      setManifest(body.data.app.manifest as Manifest)
    } else setSlugRemote({ slug, status: 'taken' })
  }

  async function submitForReview() {
    setSubmit('sending')
    try {
      const res = await fetch('/api/studio/app/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ termsVersion: terms ? STUDIO_TERMS_VERSION : null, site: site || undefined }) })
      const body = (await res.json().catch(() => null)) as { data?: { app?: CreatorApp; results?: CheckResult[] }; error?: { code?: string; details?: { results?: CheckResult[] } } } | null
      if (res.ok && body?.data?.app) {
        setApp(body.data.app)
        setServerChecks(body.data.results ?? [])
        setSubmit('done')
      } else if (body?.error?.code === 'checks_failed') {
        setServerChecks(body.error.details?.results ?? [])
        setSubmit('checks')
      } else setSubmit('error')
    } catch {
      setSubmit('error')
    }
  }

  async function proposeTool() {
    setToolState('sending')
    try {
      const res = await fetch('/api/studio/app/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: toolTitle, body: toolBody }) })
      const body = (await res.json().catch(() => null)) as { data?: { request?: ToolRequest } } | null
      if (res.ok && body?.data?.request) {
        setToolRequests([...toolRequests, body.data.request])
        setToolTitle('')
        setToolBody('')
        setToolState('done')
      } else setToolState('failed')
    } catch {
      setToolState('failed')
    }
  }

  function setAssessments(text: string) {
    setAssessmentText(text)
    if (!text.trim()) {
      setAssessmentError(false)
      patch({ assessments: undefined })
      return
    }
    try {
      const parsed = JSON.parse(text) as unknown
      setAssessmentError(false)
      patch({ assessments: parsed })
    } catch {
      setAssessmentError(true)
    }
  }

  const bytes = knowledge.reduce((n, k) => n + new TextEncoder().encode(k.markdown).length, 0)
  const persona = obj(manifest.persona)
  const questions = arr<Question>(obj(manifest.onboarding).questions)
  const suggestions = arr<Suggestion>(manifest.suggestions)
  const enabledTools = arr<string>(obj(manifest.tools).enabled)
  const toolLabels = t.creator as unknown as Record<string, string>

  const sectionLabel: Record<Section, string> = {
    dashboard: t.creator.sDashboard,
    identity: t.creator.sIdentity,
    persona: t.creator.sPersona,
    onboarding: t.creator.sOnboarding,
    knowledge: t.creator.sKnowledge,
    tools: t.creator.sTools,
    suggestions: t.creator.sSuggestions,
    assessment: t.creator.sAssessment,
    sandbox: t.creator.sSandbox,
    submit: t.creator.sSubmit,
  }

  // Pas encore d'IA : une seule chose à faire, choisir l'adresse.
  if (!app) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-black/[0.06] p-6 dark:border-white/[0.08]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t.creator.slug}
          <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().trim())} placeholder="mon-ia" className="h-11 rounded-xl font-mono" autoFocus />
        </label>
        <p className="text-xs text-muted-foreground">{f(t.creator.slugHint, { slug: slug || 'mon-ia' })}</p>
        <p className={`text-sm ${slugStatus === 'available' ? 'text-emerald-600' : slugStatus === 'idle' || slugStatus === 'checking' ? 'text-muted-foreground' : 'text-destructive'}`} role="status">
          {slugStatus === 'available' ? t.creator.slugAvailable : slugStatus === 'taken' ? t.creator.slugTaken : slugStatus === 'reserved' ? t.creator.slugReserved : slugStatus === 'invalid' ? t.creator.slugInvalid : ' '}
        </p>
        <Button type="button" size="lg" className="h-11 cursor-pointer rounded-full text-white hover:opacity-90" style={{ background: '#5E5CE6' }} disabled={slugStatus !== 'available'} onClick={() => void create()}>
          {t.creator.create}
        </Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_minmax(0,1fr)_18rem]">
      {/* Navigation des sections + état de sauvegarde. */}
      <aside className="flex flex-col gap-2 lg:sticky lg:top-20 lg:self-start">
        <div className="mb-2 flex items-center gap-3">
          <AppIcon brand={preview} size={44} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{str(manifest.name) || app.slug}</p>
            <p className="text-xs text-muted-foreground">{t.creator[STATUS_KEY[app.status]]}</p>
          </div>
        </div>
        <nav className="flex flex-row flex-wrap gap-1 lg:flex-col">
          {SECTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setSection(s)} className={`cursor-pointer rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${section === s ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>
              {sectionLabel[s]}
            </button>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground" role="status">
          {locked ? t.creator.locked : save === 'saving' ? t.creator.saving : save === 'saved' ? t.creator.saved : save === 'failed' ? t.creator.saveFailed : ' '}
        </p>
        {app.reviewNotes && ['changes_requested', 'suspended', 'published'].includes(app.status) ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">{t.creator.reviewNotes}</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{app.reviewNotes}</p>
          </div>
        ) : null}
      </aside>

      {/* La section courante. */}
      <section className="flex min-w-0 flex-col gap-6">
        <h2 className="text-xl font-semibold">{sectionLabel[section]}</h2>
        {section === 'dashboard' && dashboard ? (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">{t.creator.dashIntro}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                [t.creator.dOnboarded, dashboard.stats.onboarded],
                [t.creator.dActive7, dashboard.stats.active7d],
                [t.creator.dActive30, dashboard.stats.active30d],
                [t.creator.dMessages7, dashboard.stats.messages7d],
                [t.creator.dMessages30, dashboard.stats.messages30d],
                [t.creator.dPaying, dashboard.earnings.payingUsers],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
              <p className="font-medium">{f(t.creator.dShare, { share: dashboard.sharePercent })}</p>
              <p className="text-sm text-muted-foreground">{t.creator.dShareHint}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  [t.creator.dGross, dashboard.earnings.grossEur],
                  [t.creator.dNet, dashboard.earnings.netEur],
                  [t.creator.dPaid, dashboard.earnings.paidEur],
                  [t.creator.dDue, dashboard.earnings.balanceEur],
                  [t.creator.dPending, dashboard.earnings.pendingEur],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold">{Number(value).toFixed(2)} €</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t.creator.dPayoutHint}</p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="font-medium">{t.creator.dToolRequests}</p>
              {toolRequests.length === 0 ? <p className="text-sm text-muted-foreground">{t.creator.dNoRequests}</p> : null}
              <ul className="flex flex-col gap-2">
                {toolRequests.map((r) => (
                  <li key={r.id} className="rounded-xl border border-black/[0.06] p-3 text-sm dark:border-white/[0.08]">
                    <span className="mr-2 rounded-full bg-muted px-2 py-0.5 text-xs">{(t.creator as unknown as Record<string, string>)[`tr_${r.status}`]}</span>
                    <span className="font-medium">{r.title}</span>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        <fieldset disabled={locked} className="flex flex-col gap-5 disabled:opacity-60">
          {section === 'identity' ? (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t.creator.name}
                <Input value={str(manifest.name)} maxLength={60} onChange={(e) => patch({ name: e.target.value })} className="h-10 rounded-lg" />
                <span className="text-xs font-normal text-muted-foreground">{t.creator.nameHint}</span>
              </label>
              <p className="text-sm text-muted-foreground">
                {t.creator.slug} : <span className="font-mono">flowear.app/{app.slug}</span>
              </p>
              <LocalizedInput label={t.creator.tagline} hint={t.creator.taglineHint} value={manifest.tagline as LocalizedValue} onChange={(v) => patch({ tagline: v })} locales={locales} maxLength={140} />
              <LocalizedInput label={t.creator.pitch} value={manifest.pitch as LocalizedValue} onChange={(v) => patch({ pitch: v })} locales={locales} maxLength={140} />
              <LocalizedInput label={t.creator.description} value={manifest.description as LocalizedValue} onChange={(v) => patch({ description: v })} locales={locales} multiline maxLength={600} />
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t.creator.category}
                <select value={str(manifest.category) || 'assistant'} onChange={(e) => patch({ category: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">
                  {CATEGORY_IDS.map((c) => (
                    <option key={c} value={c}>{t.categories[c]}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1.5 text-sm font-medium">
                {t.creator.languages}
                <div className="flex flex-wrap gap-3 font-normal">
                  {SUPPORTED_LOCALES.map((l) => (
                    <label key={l} className="flex items-center gap-1.5">
                      <input type="checkbox" checked={locales.includes(l)} onChange={(e) => {
                        const next = e.target.checked ? [...locales, l] : locales.filter((x) => x !== l)
                        patch({ locales: next.length ? SUPPORTED_LOCALES.filter((x) => next.includes(x)) : undefined })
                      }} />
                      {l.toUpperCase()}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t.creator.logo}</span>
                <div role="radiogroup" className="flex w-fit gap-1 rounded-full bg-muted p-1 text-sm">
                  {(['letter', 'image'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={logoMode === mode}
                      onClick={() => {
                        setLogoMode(mode)
                        if (mode === 'letter' && brand.image) {
                          const { image: _drop, ...rest } = brand
                          void _drop
                          patch({ brand: rest })
                        }
                      }}
                      className={`cursor-pointer rounded-full px-3 py-1 transition-colors ${logoMode === mode ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                    >
                      {mode === 'letter' ? t.creator.logoLetter : t.creator.logoImage}
                    </button>
                  ))}
                </div>
                {logoMode === 'image' ? <LogoPicker image={str(brand.image) || undefined} background={[preview.from, preview.to]} onChange={(image) => patch({ brand: { ...brand, from: preview.from, to: preview.to, glyph: preview.glyph, image } })} /> : null}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t.creator.colorFrom}
                  <input type="color" value={preview.from} onChange={(e) => patch({ brand: { ...brand, from: e.target.value } })} className="h-10 w-full cursor-pointer rounded-lg border border-input bg-background" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t.creator.colorTo}
                  <input type="color" value={preview.to} onChange={(e) => patch({ brand: { ...brand, to: e.target.value } })} className="h-10 w-full cursor-pointer rounded-lg border border-input bg-background" />
                </label>
                <label className={`flex flex-col gap-1.5 text-sm font-medium ${logoMode === 'image' ? 'opacity-50' : ''}`}>
                  {t.creator.glyph}
                  <Input value={str(brand.glyph)} maxLength={2} onChange={(e) => patch({ brand: { ...brand, glyph: e.target.value } })} className="h-10 rounded-lg" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t.creator.shortName}
                  <Input value={str(obj(manifest.pwa).shortName)} maxLength={12} onChange={(e) => patch({ pwa: { ...obj(manifest.pwa), shortName: e.target.value, themeColor: preview.from, backgroundColor: '#ffffff' } })} className="h-10 rounded-lg" />
                </label>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
                <AppIcon brand={preview} size={64} />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.creator.preview}</p>
                  <p className="truncate text-lg font-semibold">{str(manifest.name) || app.slug}</p>
                  <p className="truncate text-sm text-muted-foreground">{asLocalized(manifest.tagline as LocalizedValue)[locale] ?? ''}</p>
                </div>
              </div>
            </>
          ) : null}

          {section === 'persona' ? (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t.creator.system}
                <Textarea rows={16} maxLength={PERSONA_MAX} value={str(persona.system)} onChange={(e) => patch({ persona: { ...persona, system: e.target.value } })} className="font-mono text-[13px] leading-relaxed" />
                <span className="text-xs font-normal text-muted-foreground">{f(t.creator.systemHint, { min: PERSONA_MIN, max: PERSONA_MAX })} · {f(t.creator.chars, { n: str(persona.system).length, max: PERSONA_MAX })}</span>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t.creator.tone}
                <Input value={str(persona.tone)} maxLength={200} onChange={(e) => patch({ persona: { ...persona, tone: e.target.value || undefined } })} className="h-10 rounded-lg" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t.creator.boundaries}
                <Textarea rows={4} value={arr<string>(persona.boundaries).join('\n')} onChange={(e) => patch({ persona: { ...persona, boundaries: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) } })} />
              </label>
            </>
          ) : null}

          {section === 'onboarding' ? (
            <>
              <p className="text-sm text-muted-foreground">{t.creator.questions}</p>
              {questions.map((q, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                      {t.creator.qKey}
                      <Input value={q.key} maxLength={31} onChange={(e) => patch({ onboarding: { ...obj(manifest.onboarding), questions: questions.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) } })} className="h-10 rounded-lg font-mono" />
                      <span className="text-xs font-normal text-muted-foreground">{t.creator.qKeyHint}</span>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                      {t.creator.qType}
                      <select value={q.type} onChange={(e) => patch({ onboarding: { ...obj(manifest.onboarding), questions: questions.map((x, j) => (j === i ? { ...x, type: e.target.value as Question['type'], options: e.target.value === 'choice' || e.target.value === 'multi' ? (x.options?.length ? x.options : [{ value: 'a' }, { value: 'b' }]) : undefined } : x)) } })} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">
                        <option value="text">{t.creator.typeText}</option>
                        <option value="choice">{t.creator.typeChoice}</option>
                        <option value="multi">{t.creator.typeMulti}</option>
                        <option value="number">{t.creator.typeNumber}</option>
                      </select>
                    </label>
                    <Button type="button" variant="ghost" size="sm" className="cursor-pointer self-end" disabled={questions.length <= 1} onClick={() => patch({ onboarding: { ...obj(manifest.onboarding), questions: questions.filter((_, j) => j !== i) } })}>
                      {t.creator.remove}
                    </Button>
                  </div>
                  <LocalizedInput label={t.creator.qLabel} value={q.label} onChange={(v) => patch({ onboarding: { ...obj(manifest.onboarding), questions: questions.map((x, j) => (j === i ? { ...x, label: v } : x)) } })} locales={locales} maxLength={160} />
                  {q.type === 'choice' || q.type === 'multi' ? (
                    <div className="flex flex-col gap-3">
                      <span className="text-sm font-medium">{t.creator.options}</span>
                      {(q.options ?? []).map((o, k) => (
                        <div key={k} className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_auto]">
                          <Input value={o.value} maxLength={40} placeholder={t.creator.optionValue} onChange={(e) => patch({ onboarding: { ...obj(manifest.onboarding), questions: questions.map((x, j) => (j === i ? { ...x, options: (x.options ?? []).map((y, m) => (m === k ? { ...y, value: e.target.value } : y)) } : x)) } })} className="h-10 rounded-lg font-mono" />
                          <LocalizedInput label={t.creator.optionLabel} value={o.label} onChange={(v) => patch({ onboarding: { ...obj(manifest.onboarding), questions: questions.map((x, j) => (j === i ? { ...x, options: (x.options ?? []).map((y, m) => (m === k ? { ...y, label: v } : y)) } : x)) } })} locales={locales} maxLength={80} />
                          <Button type="button" variant="ghost" size="sm" className="cursor-pointer self-end" disabled={(q.options ?? []).length <= 2} onClick={() => patch({ onboarding: { ...obj(manifest.onboarding), questions: questions.map((x, j) => (j === i ? { ...x, options: (x.options ?? []).filter((_, m) => m !== k) } : x)) } })}>
                            {t.creator.remove}
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" className="cursor-pointer self-start rounded-full" disabled={(q.options ?? []).length >= 12} onClick={() => patch({ onboarding: { ...obj(manifest.onboarding), questions: questions.map((x, j) => (j === i ? { ...x, options: [...(x.options ?? []), { value: '' }] } : x)) } })}>
                        {t.creator.addOption}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              <Button type="button" variant="outline" className="cursor-pointer self-start rounded-full" disabled={questions.length >= 3} onClick={() => patch({ onboarding: { ...obj(manifest.onboarding), questions: [...questions, { type: 'text', key: `q${questions.length + 1}` }] } })}>
                {t.creator.addQuestion}
              </Button>
            </>
          ) : null}

          {section === 'knowledge' ? (
            <>
              <ModeSwitch value={knowledgeMode} simple={t.creator.modeSimple} advanced={t.creator.modeAdvanced} onChange={(mode) => {
                if (mode === 'simple' && knowledge.some((k) => k.name !== SIMPLE_KNOWLEDGE_NAME)) {
                  // Passage au simple : tout le savoir est gardé, réuni dans un seul texte.
                  dirty.current = true
                  setKnowledge([{ name: SIMPLE_KNOWLEDGE_NAME, markdown: knowledge.map((k) => k.markdown.trim()).filter(Boolean).join('\n\n') }])
                }
                setKnowledgeMode(mode)
              }} />
              {knowledgeMode === 'simple' ? (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t.creator.knowledgeSimpleLabel}
                  <span className="text-xs font-normal text-muted-foreground">{t.creator.knowledgeSimpleHint}</span>
                  <Textarea
                    rows={18}
                    value={knowledge.find((k) => k.name === SIMPLE_KNOWLEDGE_NAME)?.markdown ?? knowledge[0]?.markdown ?? ''}
                    maxLength={KNOWLEDGE_MAX_BYTES}
                    placeholder={t.creator.knowledgeSimplePlaceholder}
                    onChange={(e) => {
                      dirty.current = true
                      setKnowledge(e.target.value.trim() ? [{ name: SIMPLE_KNOWLEDGE_NAME, markdown: e.target.value }] : [])
                    }}
                  />
                  <span className="text-xs font-normal text-muted-foreground">{f(t.creator.size, { kb: Math.round(bytes / 100) / 10, max: KNOWLEDGE_MAX_BYTES / 1000 })}</span>
                </label>
              ) : (
                <>
              <p className="text-sm text-muted-foreground">{f(t.creator.files, { max: KNOWLEDGE_MAX_FILES, kb: KNOWLEDGE_MAX_BYTES / 1000 })}</p>
              <p className="text-xs text-muted-foreground">{f(t.creator.size, { kb: Math.round(bytes / 100) / 10, max: KNOWLEDGE_MAX_BYTES / 1000 })}</p>
              {knowledge.map((k, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
                  <div className="flex items-end gap-2">
                    <label className="flex grow flex-col gap-1.5 text-sm font-medium">
                      {t.creator.fileName}
                      <Input value={k.name} maxLength={40} onChange={(e) => { dirty.current = true; setKnowledge(knowledge.map((x, j) => (j === i ? { ...x, name: e.target.value.toLowerCase() } : x))) }} className="h-10 rounded-lg font-mono" />
                    </label>
                    <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => { dirty.current = true; setKnowledge(knowledge.filter((_, j) => j !== i)) }}>
                      {t.creator.remove}
                    </Button>
                  </div>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {t.creator.fileContent}
                    <Textarea rows={10} value={k.markdown} onChange={(e) => { dirty.current = true; setKnowledge(knowledge.map((x, j) => (j === i ? { ...x, markdown: e.target.value } : x))) }} className="font-mono text-[13px]" />
                  </label>
                </div>
              ))}
              <Button type="button" variant="outline" className="cursor-pointer self-start rounded-full" disabled={knowledge.length >= KNOWLEDGE_MAX_FILES} onClick={() => { dirty.current = true; setKnowledge([...knowledge, { name: `fichier-${knowledge.length + 1}`, markdown: '' }]) }}>
                {t.creator.addFile}
              </Button>
                </>
              )}
            </>
          ) : null}

          {section === 'tools' ? (
            <>
              <p className="text-sm text-muted-foreground">{t.creator.toolsIntro}</p>
              <ul className="flex flex-col gap-2">
                {CREATOR_TOOL_ALLOWLIST.map((tool) => (
                  <li key={tool}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/[0.06] p-3 hover:bg-muted/50 dark:border-white/[0.08]">
                      <input type="checkbox" className="mt-1" checked={tool === 'helpline' || enabledTools.includes(tool)} disabled={tool === 'helpline'} onChange={(e) => patch({ tools: { enabled: e.target.checked ? [...enabledTools, tool] : enabledTools.filter((x) => x !== tool) } })} />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{toolLabels[`tn_${tool}`]}</span>
                        <span className="text-sm text-muted-foreground">{toolLabels[`t_${tool}`]}</span>
                        <span className="text-xs text-muted-foreground">{toolLabels[`te_${tool}`]}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
                <p className="text-sm">{t.creator.proposeTool}</p>
                <Input value={toolTitle} maxLength={120} placeholder={t.creator.proposeTitle} onChange={(e) => setToolTitle(e.target.value)} className="h-10 rounded-lg" />
                <Textarea rows={3} value={toolBody} maxLength={2000} placeholder={t.creator.proposeBody} onChange={(e) => setToolBody(e.target.value)} />
                <Button type="button" variant="outline" size="sm" className="cursor-pointer self-start rounded-full" disabled={toolTitle.trim().length < 3 || toolBody.trim().length < 10 || toolState === 'sending'} onClick={() => void proposeTool()}>
                  {t.creator.proposeToolLink}
                </Button>
                {toolState === 'done' ? <p role="status" className="text-sm text-emerald-600">{t.creator.proposeDone}</p> : null}
                {toolState === 'failed' ? <p role="alert" className="text-sm text-destructive">{t.creator.submitError}</p> : null}
              </div>
            </>
          ) : null}

          {section === 'suggestions' ? (
            <>
              <p className="text-sm text-muted-foreground">{t.creator.suggestionsIntro}</p>
              {suggestions.map((s, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
                  <LocalizedInput label={t.creator.sLabel} value={s.label} onChange={(v) => patch({ suggestions: suggestions.map((x, j) => (j === i ? { ...x, label: v } : x)) })} locales={locales} maxLength={40} />
                  <LocalizedInput label={t.creator.sPrompt} value={s.prompt} onChange={(v) => patch({ suggestions: suggestions.map((x, j) => (j === i ? { ...x, prompt: v } : x)) })} locales={locales} maxLength={200} />
                  <Button type="button" variant="ghost" size="sm" className="cursor-pointer self-start" onClick={() => patch({ suggestions: suggestions.filter((_, j) => j !== i) })}>
                    {t.creator.remove}
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" className="cursor-pointer self-start rounded-full" disabled={suggestions.length >= 8} onClick={() => patch({ suggestions: [...suggestions, {}] })}>
                {t.creator.addSuggestion}
              </Button>
            </>
          ) : null}

          {section === 'assessment' ? (
            <>
              <ModeSwitch value={assessmentMode} simple={t.creator.modeSimple} advanced={t.creator.modeAdvanced} onChange={(mode) => {
                // Avancé : le créateur reprend la main sur le JSON (prérempli avec ce que Flowear a posé),
                // sa description est mise de côté ; revenir en simple la rend à Flowear.
                if (mode === 'advanced' && requests.assessment) {
                  setParkedBrief(requests.assessment)
                  setAssessmentText(arr(manifest.assessments).length ? JSON.stringify(manifest.assessments, null, 2) : assessmentText)
                  setRequests({ ...requests, assessment: undefined })
                  dirty.current = true
                }
                if (mode === 'simple' && parkedBrief && !requests.assessment) {
                  setRequests({ ...requests, assessment: parkedBrief })
                  dirty.current = true
                }
                setAssessmentMode(mode)
              }} />
              {assessmentMode === 'simple' ? (
                <>
                  <p className="text-sm text-muted-foreground">{t.creator.assessmentSimpleIntro}</p>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {t.creator.assessmentBriefLabel}
                    <Textarea
                      rows={12}
                      maxLength={ASSESSMENT_BRIEF_MAX}
                      value={requests.assessment ?? ''}
                      placeholder={t.creator.assessmentBriefPlaceholder}
                      onChange={(e) => {
                        dirty.current = true
                        setRequests({ ...requests, assessment: e.target.value || undefined })
                      }}
                    />
                  </label>
                  {arr(manifest.assessments).length ? <p className="text-sm text-emerald-600">{t.creator.assessmentBuilt}</p> : null}
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{t.creator.assessmentIntro}</p>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {t.creator.assessmentJson}
                    <Textarea rows={16} value={assessmentText} onChange={(e) => setAssessments(e.target.value)} className="font-mono text-[13px]" spellCheck={false} />
                  </label>
                  {assessmentError ? <p role="alert" className="text-sm text-destructive">{t.creator.assessmentInvalid}</p> : null}
                </>
              )}
            </>
          ) : null}
        </fieldset>

        {section === 'sandbox' ? <SandboxChat manifest={manifest} knowledge={knowledge} brand={preview} appName={str(manifest.name) || app.slug} disabled={!localChecksPass && !results.find((r) => r.check === 'schema')?.ok} /> : null}

        {section === 'submit' ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t.creator.submitIntro}</p>
            {locked || submit === 'done' ? (
              <p role="status" className="font-medium">{t.creator.submitted}</p>
            ) : (
              <>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t.creator.site}
                  <Input value={site} maxLength={120} placeholder="monsite.fr" onChange={(e) => setSite(e.target.value.trim().toLowerCase())} className="h-10 rounded-lg" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                  {f(t.creator.terms, { version: STUDIO_TERMS_VERSION })}
                </label>
                <Link href="/studio/conditions" target="_blank" className="text-sm underline">{t.creator.termsLink}</Link>
                <Button type="button" size="lg" className="h-11 cursor-pointer self-start rounded-full text-white hover:opacity-90" style={{ background: '#5E5CE6' }} disabled={!terms || !localChecksPass || submit === 'sending'} onClick={() => void submitForReview()}>
                  {submit === 'sending' ? t.creator.submitting : t.creator.submitBtn}
                </Button>
                {submit === 'checks' ? <p role="alert" className="text-sm text-destructive">{t.creator.submitFailed}</p> : null}
                {submit === 'error' ? <p role="alert" className="text-sm text-destructive">{t.creator.submitError}</p> : null}
              </>
            )}
            {scenarioChecks.length ? <ChecksPanel results={scenarioChecks} intro={false} /> : null}
          </div>
        ) : null}
      </section>

      {/* Les règles, à droite, toujours visibles sur grand écran. */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <h3 className="mb-3 text-sm font-semibold">{t.creator.checksTitle}</h3>
        <ChecksPanel results={results} />
      </aside>
    </div>
  )
}

/** Deux façons de remplir une section : en mots (Flowear s'occupe du reste) ou dans le format technique. */
function ModeSwitch<T extends 'simple' | 'advanced'>({ value, simple, advanced, onChange }: { value: T; simple: string; advanced: string; onChange: (mode: T) => void }) {
  return (
    <div role="radiogroup" className="flex w-fit gap-1 rounded-full bg-muted p-1 text-sm">
      {(['simple', 'advanced'] as T[]).map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          onClick={() => onChange(mode)}
          className={`cursor-pointer rounded-full px-3 py-1 transition-colors ${value === mode ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
        >
          {mode === 'simple' ? simple : advanced}
        </button>
      ))}
    </div>
  )
}
