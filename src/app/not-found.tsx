import type { Metadata } from 'next'
import Link from 'next/link'
import { FlowearLogo } from '@/components/flowear-logo'
import { getI18n } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.notFound.title }
}

/**
 * Page 404, dans le style du reste : le logo, une phrase qui rassure (rien n'est perdu),
 * un retour au hub. Sert aussi de réponse pour une IA privée demandée sans droit : pour
 * cette personne, l'IA n'existe pas, et la page ne doit rien laisser deviner.
 */
export default async function NotFound() {
  const { t } = await getI18n()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <FlowearLogo size={64} />
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.notFound.code}</p>
        <h1 className="text-balance text-3xl font-semibold tracking-[-0.03em]">{t.notFound.title}</h1>
        <p className="max-w-md text-balance text-muted-foreground">{t.notFound.body}</p>
      </div>
      <Link href="/" className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90">
        {t.notFound.hub}
      </Link>
    </main>
  )
}
