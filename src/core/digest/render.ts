import type { Messages } from '@/lib/i18n/messages'
import { fmt } from '@/lib/i18n/messages'
import type { Digest } from './build'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Email du digest : sujet, texte brut et HTML sobre. Tout contenu utilisateur est échappé. */
export function renderDigest(digest: Digest, t: Messages, links: { appUrl: string; unsubscribeUrl: string }): { subject: string; text: string; html: string } {
  const d = t.digest
  const subject = fmt(d.subject, { notes: digest.totalNotes, artifacts: digest.totalArtifacts })
  const textParts: string[] = [d.intro, '']
  const htmlParts: string[] = [`<p>${escapeHtml(d.intro)}</p>`]
  for (const app of digest.apps) {
    const url = `${links.appUrl}/${app.slug}`
    textParts.push(`${app.name} (${fmt(d.messages, { count: app.messages })})`)
    htmlParts.push(`<h2 style="font-size:16px;margin:24px 0 8px">${escapeHtml(app.name)} <span style="font-weight:normal;color:#666">(${escapeHtml(fmt(d.messages, { count: app.messages }))})</span></h2>`)
    if (app.notes.length) {
      textParts.push(`  ${d.remembered}`)
      htmlParts.push(`<p style="margin:8px 0 4px;color:#666">${escapeHtml(d.remembered)}</p><ul>`)
      for (const n of app.notes) {
        textParts.push(`  - ${n}`)
        htmlParts.push(`<li>${escapeHtml(n)}</li>`)
      }
      htmlParts.push('</ul>')
    }
    if (app.artifacts.length) {
      textParts.push(`  ${d.produced}`)
      htmlParts.push(`<p style="margin:8px 0 4px;color:#666">${escapeHtml(d.produced)}</p><ul>`)
      for (const a of app.artifacts) {
        const label = (t.cards as Record<string, string>)[a.type] ?? a.type
        textParts.push(`  - ${label} : ${a.title}`)
        htmlParts.push(`<li>${escapeHtml(label)} : ${escapeHtml(a.title)}</li>`)
      }
      htmlParts.push('</ul>')
    }
    textParts.push(`  ${fmt(d.open, { name: app.name })} ${url}`, '')
    htmlParts.push(`<p><a href="${escapeHtml(url)}">${escapeHtml(fmt(d.open, { name: app.name }))}</a></p>`)
  }
  textParts.push('', `${d.unsubscribe} ${links.unsubscribeUrl}`)
  htmlParts.push(`<p style="margin-top:32px;font-size:12px;color:#999"><a href="${escapeHtml(links.unsubscribeUrl)}" style="color:#999">${escapeHtml(d.unsubscribe)}</a></p>`)
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;line-height:1.5">${htmlParts.join('')}</body></html>`
  return { subject, text: textParts.join('\n'), html }
}
