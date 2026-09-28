import { appIconPath } from '@/core/push/nudge'
import type { Repo } from '@/core/data/repo'
import type { Checkin } from '@/core/data/types'
import type { PushPayload } from '@/core/push/nudge'
import { nextRun } from './schedule'

export interface RunCheckinsDeps {
  repo: Repo
  now: () => Date
  /** Envoi d'une notification à un navigateur ; `expired` = l'abonnement doit être retiré. */
  send: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<'sent' | 'skipped' | 'expired'>
  /** Nom affiché de l'IA, ou null si elle n'existe plus. */
  appName: (slug: string) => string | null
  serialize: (payload: PushPayload) => string
  log?: (message: string, details?: Record<string, unknown>) => void
}

export interface RunCheckinsResult {
  examined: number
  sent: number
  skipped: number
  expired: number
  failed: number
}

const BATCH = 200
const MAX_PAGES = 20
/** Un rappel en retard de plus de deux heures ne part plus : mieux vaut rien qu'un « bonjour » à minuit. */
export const STALE_MS = 2 * 3_600_000

/** Ce que le clic sur la notification ouvre : le chat, avec la question déjà posée de la part de la personne. */
export function checkinUrl(checkin: Pick<Checkin, 'appSlug' | 'id'>): string {
  return `/${checkin.appSlug}?ask=${encodeURIComponent(checkin.id)}`
}

export function buildCheckinPayload(checkin: Checkin, appName: string): PushPayload {
  return { title: appName, body: checkin.message, url: checkinUrl(checkin), tag: `checkin-${checkin.id}`, icon: appIconPath(checkin.appSlug) }
}

/** Prochain passage d'un rappel quotidien ; null pour un rappel unique (il s'éteint). */
export function afterSend(checkin: Checkin, now: Date): Date | null {
  if (checkin.kind === 'once') return null
  return nextRun({ timeLocal: checkin.timeLocal, timezone: checkin.timezone, days: checkin.days }, now)
}

/**
 * Passe du cron : chaque rappel dont l'heure est arrivée part sur tous les navigateurs
 * abonnés de la personne pour cette IA, puis avance à son prochain passage. Un rappel
 * sans navigateur avance quand même : il ne doit pas rester coincé « en retard ».
 * Un échec passager n'avance pas : la passe suivante réessaie.
 */
export async function runCheckins(deps: RunCheckinsDeps): Promise<RunCheckinsResult> {
  const { repo, now, send, appName, serialize } = deps
  const log = deps.log ?? (() => undefined)
  const result: RunCheckinsResult = { examined: 0, sent: 0, skipped: 0, expired: 0, failed: 0 }
  const failedIds = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const at = now()
    const batch = (await repo.checkins.listDue(at, BATCH)).filter((c) => !failedIds.has(c.id))
    if (batch.length === 0) break
    result.examined += batch.length
    for (const checkin of batch) {
      try {
        const name = appName(checkin.appSlug)
        const stale = at.getTime() - new Date(checkin.nextRunAt).getTime() > STALE_MS
        if (!name || stale) {
          await repo.checkins.advance(checkin.id, afterSend(checkin, at), at)
          result.skipped++
          continue
        }
        const devices = await repo.push.listForUserApp(checkin.userId, checkin.appSlug)
        const payload = serialize(buildCheckinPayload(checkin, name))
        let delivered = 0
        for (const device of devices) {
          const outcome = await send(device, payload)
          if (outcome === 'expired') {
            await repo.push.removeExpired(device.endpoint)
            result.expired++
          } else if (outcome === 'sent') delivered++
        }
        await repo.checkins.advance(checkin.id, afterSend(checkin, at), at)
        if (delivered > 0) {
          result.sent++
          await repo.events.track({ name: 'checkin_sent', userId: checkin.userId, appSlug: checkin.appSlug, props: { checkinId: checkin.id, kind: checkin.kind, devices: delivered } })
        } else result.skipped++
      } catch (error) {
        log('checkin failed', { id: checkin.id, error: error instanceof Error ? error.message : String(error) })
        failedIds.add(checkin.id)
        result.failed++
      }
    }
    if (batch.length < BATCH) break
  }
  return result
}
