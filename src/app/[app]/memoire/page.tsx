import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { MemoryPanel } from '@/components/memory/memory-panel'
import { canSeePrivate } from '@/lib/access'
import { getLocale } from '@/lib/i18n/server'
import { toPublicApp } from '@/lib/public-app'

/** Page mémoire d'une IA : mêmes règles d'accès que le chat. */
export default async function MemoryPage({ params }: { params: Promise<{ app: string }> }) {
  const { app: slug } = await params
  await ensureAppsLoaded()
  const app = getApp(slug)
  if (!app) notFound()
  const { userId } = await auth()
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/${slug}/memoire`)}`)
  if (app.access === 'private' && !(await canSeePrivate(userId))) notFound()
  return <MemoryPanel app={toPublicApp(app, await getLocale(userId))} />
}
