import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { FlowearLogo } from '@/components/flowear-logo'
import { CreatorEditor } from '@/components/studio/creator/creator-editor'
import type { CheckResult } from '@/core/studio/checks'
import { creatorDashboard } from '@/core/studio/dashboard'
import { getCreatorApp, latestChecks } from '@/core/studio/draft'
import { isCreator } from '@/lib/access'
import { getRepo } from '@/lib/db/repo'
import { getI18n } from '@/lib/i18n/server'

export const metadata: Metadata = { title: 'Flowear Studio', robots: { index: false, follow: false } }

/**
 * L'espace créateur. Connecté et créateur (rôle accordé depuis l'admin), sinon retour au Studio :
 * la page n'existe pas pour les autres. Le brouillon et ses vérifications sont lus une fois ici,
 * l'éditeur fait le reste par les routes `/api/studio/app*`.
 */
export default async function CreatorPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in?redirect_url=/studio/mon-ia')
  if (!(await isCreator(userId))) redirect('/studio')
  const { t } = await getI18n(userId)
  const repo = getRepo()
  const app = await getCreatorApp(repo, userId)
  const [checks, dashboard] = await Promise.all([app ? latestChecks(repo, app) : Promise.resolve([] as CheckResult[]), creatorDashboard(repo, userId, new Date())])

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <nav className="sticky top-0 z-30 border-b border-black/[0.06] bg-background/90 backdrop-blur dark:border-white/[0.08]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/studio" className="flex items-center gap-2 font-semibold">
            <FlowearLogo size={22} />
            <span>Studio</span>
          </Link>
          <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">{t.creator.backToStudio}</Link>
        </div>
      </nav>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t.creator.title}</h1>
          <p className="text-muted-foreground">{t.creator.subtitle}</p>
        </header>
        <CreatorEditor initial={app} initialChecks={checks} dashboard={dashboard} />
      </div>
    </main>
  )
}
