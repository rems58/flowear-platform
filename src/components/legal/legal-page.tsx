import type { ReactNode } from 'react'
import Link from 'next/link'
import { FlowearLogo } from '@/components/flowear-logo'
import { PUBLISHER } from '@/core/legal/publisher'

interface Props {
  eyebrow: string
  title: string
  intro: string
  children: ReactNode
}

/**
 * Gabarit des pages légales : logo, titre, date de révision, texte lisible (colonne étroite,
 * interligne large), et le lien vers l'autre page en pied. Le texte est en français seul pour
 * l'instant (exception documentée dans `docs/12-lecons.md`) ; les gabarits, eux, restent neutres.
 */
export function LegalPage({ eyebrow, title, intro, children }: Props) {
  const updated = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(PUBLISHER.updatedAt))
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 pb-24 pt-14">
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <FlowearLogo size={28} />
        Flowear
      </Link>
      <header className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        <h1 className="text-balance text-3xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="text-pretty text-muted-foreground">{intro}</p>
        <p className="text-xs text-muted-foreground">Dernière mise à jour : {updated}</p>
      </header>
      <div className="flex flex-col gap-8 text-[15px] leading-7 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li+li]:mt-1 [&_a]:underline [&_a]:underline-offset-4">
        {children}
      </div>
      <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-black/5 pt-6 text-sm text-muted-foreground dark:border-white/[0.06]">
        <Link href="/confidentialite" className="hover:text-foreground">Confidentialité</Link>
        <Link href="/conditions" className="hover:text-foreground">Conditions d’utilisation</Link>
        <Link href="/pricing" className="hover:text-foreground">Tarifs</Link>
        <a href={`mailto:${PUBLISHER.email}`} className="hover:text-foreground">{PUBLISHER.email}</a>
      </footer>
    </main>
  )
}

/** Une section titrée, pour garder la même structure d'une page à l'autre. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

/** Ligne d'identité de l'éditeur : n'affiche que ce qui est renseigné. */
export function publisherLine(): string {
  const parts = [`${PUBLISHER.brand} est édité par ${PUBLISHER.name}, ${PUBLISHER.status}`]
  if (PUBLISHER.siren) parts.push(`SIREN ${PUBLISHER.siren}`)
  if (PUBLISHER.address) parts.push(PUBLISHER.address)
  return `${parts.join(', ')}. Hébergement : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis.`
}
