import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BRAND_IMAGE_RE } from '@/apps/types'
import { AppIcon } from '@/components/app-icon'
import { AssessmentBuilder } from '@/components/admin/assessment-builder'
import { ReviewActions } from '@/components/admin/review-actions'
import { ToolRequestStatus } from '@/components/admin/tool-request-status'
import { Section, Table } from '@/components/admin/ui'
import { SandboxChat } from '@/components/studio/creator/sandbox-chat'
import { pick, type LocalizedText } from '@/core/i18n/locale'
import { isSafeSlug } from '@/core/security/sanitize'
import { latestChecks } from '@/core/studio/draft'
import { L, fmt } from '@/lib/admin/labels'
import { requireAdminPage } from '@/lib/admin/access'
import { getRepo } from '@/lib/db/repo'

const text = (v: unknown): string => (v === undefined || v === null ? '' : typeof v === 'string' ? v : pick(v as LocalizedText, 'fr'))

/**
 * Une IA soumise, lue comme Rémy la relit : identité, persona, questions, outils, suggestions,
 * connaissances, résultats des vérifications, bac à sable sur le brouillon, puis la décision.
 */
export default async function StudioReviewDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdminPage()
  const { slug } = await params
  if (!isSafeSlug(slug)) notFound()
  const repo = getRepo()
  const app = await repo.creatorApps.get(slug)
  if (!app) notFound()
  const [checks, owner, toolRequests] = await Promise.all([latestChecks(repo, app), repo.users.get(app.ownerId), repo.toolRequests.listBySlug(slug)])
  const m = app.manifest
  // Jamais `m.brand` tel quel : `mark` serait injecté comme SVG dans la page de l'admin.
  const hex = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback)
  const brand = { from: hex(m.brand?.from, '#5E5CE6'), to: hex(m.brand?.to, '#3F3DB8'), glyph: (m.brand?.glyph ?? text(m.name).slice(0, 1) ?? 'A').slice(0, 2) || 'A', ...(typeof m.brand?.image === 'string' && BRAND_IMAGE_RE.test(m.brand.image) ? { image: m.brand.image } : {}) }
  const questions = m.onboarding?.questions ?? []
  const knowledge = app.knowledge ?? []

  return (
    <>
      <p className="mb-3 text-sm"><Link href="/admin/studio/revue" className="underline-offset-4 hover:underline">← {L.studio.review}</Link></p>
      <div className="mb-6 flex items-center gap-4">
        <AppIcon brand={brand} size={56} />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{text(m.name) || slug}</h1>
          <p className="text-sm text-muted-foreground">
            /{slug} · {L.studio.status[app.status]} · {L.studio.version} {app.version} · {L.studio.owner} : <Link href={`/admin/personnes/${encodeURIComponent(app.ownerId)}`} className="underline-offset-4 hover:underline">{owner?.email ?? app.ownerId}</Link>
            {app.submittedAt ? ` · ${L.studio.submittedAt} ${fmt.dateTime(app.submittedAt)}` : ''}
          </p>
          <p className="text-sm text-muted-foreground">{text(m.tagline)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={L.studio.checks}>
            <ul className="flex flex-col gap-1 text-sm">
              {checks.map((c) => (
                <li key={c.check} className={c.ok ? '' : 'text-destructive'}>
                  {c.ok ? '✓' : '✗'} {c.check}{c.detail ? <span className="block text-xs text-muted-foreground">{c.detail}</span> : null}
                </li>
              ))}
              {checks.length === 0 ? <li className="text-muted-foreground">{L.studio.emptyQueue}</li> : null}
            </ul>
          </Section>
          {app.reviewNotes ? (
            <Section title={L.studio.lastNotes}>
              <p className="whitespace-pre-wrap text-sm">{app.reviewNotes}</p>
            </Section>
          ) : null}
          <Section title={L.studio.persona}>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-3 font-mono text-xs leading-relaxed">{m.persona?.system ?? ''}</pre>
            {m.persona?.tone ? <p className="mt-2 text-sm text-muted-foreground">Ton : {m.persona.tone}</p> : null}
            {m.persona?.boundaries?.length ? <ul className="mt-2 list-disc pl-5 text-sm">{m.persona.boundaries.map((b, i) => <li key={i}>{b}</li>)}</ul> : null}
          </Section>
          <Section title={L.studio.questions}>
            <Table head={['Clé', 'Type', 'Question', 'Options']} empty="" rows={questions.map((q) => [q.key, q.type, text(q.label), 'options' in q ? q.options.map((o) => `${o.value} (${text(o.label)})`).join(', ') : ''])} />
          </Section>
          <Section title={L.studio.tools}>
            <p className="font-mono text-sm">{(m.tools?.enabled ?? []).join(', ') || '(aucun)'}</p>
          </Section>
          <Section title={L.studio.suggestions}>
            <Table head={['Bouton', 'Message']} empty="(aucune)" rows={(m.suggestions ?? []).map((s) => [text(s.label), text(s.prompt)])} />
          </Section>
          <Section title={L.studio.knowledge}>
            {knowledge.length === 0 ? <p className="text-sm text-muted-foreground">(aucune)</p> : null}
            {knowledge.map((k) => (
              <details key={k.name} className="mb-2">
                <summary className="cursor-pointer text-sm font-medium">{k.name} · {Math.round(new TextEncoder().encode(k.markdown).length / 100) / 10} Ko</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-3 font-mono text-xs">{k.markdown}</pre>
              </details>
            ))}
          </Section>
          {app.requests.assessment || m.assessments?.length ? (
            <Section title={L.studio.assessmentBuilt}>
              {app.requests.assessment ? (
                <>
                  <p className="mb-1 text-sm font-medium">{L.studio.assessmentBrief}</p>
                  <p className="mb-4 whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm">{app.requests.assessment}</p>
                </>
              ) : null}
              <AssessmentBuilder slug={slug} initial={m.assessments?.length ? JSON.stringify(m.assessments, null, 2) : ''} />
            </Section>
          ) : null}
          <Section title={L.studio.toolRequests}>
            <Table head={['Outil', 'Description', 'Statut']} empty={L.studio.noToolRequests} rows={toolRequests.map((r) => [r.title, <span key="b" className="whitespace-pre-wrap">{r.body}</span>, <ToolRequestStatus key="s" slug={slug} id={r.id} status={r.status} />])} />
          </Section>
          <Section title={L.studio.sandbox}>
            <SandboxChat manifest={m as unknown as Record<string, unknown>} knowledge={knowledge} brand={brand} appName={text(m.name) || slug} disabled={false} />
          </Section>
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <ReviewActions slug={slug} status={app.status} />
        </aside>
      </div>
    </>
  )
}
