import { fmt, type Messages } from '@/lib/i18n/messages'

/**
 * Relance push : le déclencheur externe d'Eyal, tenu court.
 *
 * Deux garde-fous de principe, parce qu'une notification qui dérange se paie en
 * désinstallation : on ne relance que quelqu'un qui a vraiment laissé quelque chose
 * derrière lui, et on se tait au bout d'un moment si rien n'y fait. La fréquence est
 * bornée côté base (une relance par semaine au plus, voir `last_nudged_at`).
 */
export interface NudgeInput {
  appSlug: string
  appName: string
  firstName: string | null
  /** Souvenirs notés et productions faites depuis la dernière visite. */
  notes: number
  artifacts: number
  /** Jours entiers depuis le dernier message envoyé à cette IA. */
  idleDays: number
}

export interface PushPayload {
  title: string
  body: string
  /** Chemin ouvert au clic, toujours relatif : le service worker le résout sur notre origine. */
  url: string
  /** Deux relances de la même IA se remplacent au lieu de s'empiler. */
  tag: string
  /** Icône de la notification : celle de l'IA (`/pwa-icons/<slug>-192.png`), pas celle de Flowear. */
  icon?: string
}

export function appIconPath(appSlug: string): string {
  return `/pwa-icons/${appSlug}-192.png`
}

/** En deçà, la personne est encore là : rien à relancer. Au delà, on la laisse tranquille. */
export const MIN_IDLE_DAYS = 3
export const MAX_IDLE_DAYS = 45

export function shouldNudge(input: Pick<NudgeInput, 'idleDays'>): boolean {
  return input.idleDays >= MIN_IDLE_DAYS && input.idleDays <= MAX_IDLE_DAYS
}

/**
 * Le corps rappelle ce qui a été déposé, pas ce qui manque : on rappelle un
 * investissement, on ne fabrique pas un manque. À défaut de contenu, une phrase neutre.
 */
export function buildNudge(input: NudgeInput, t: Messages): PushPayload {
  const title = input.firstName ? fmt(t.push.nudgeTitleNamed, { name: input.firstName, app: input.appName }) : fmt(t.push.nudgeTitle, { app: input.appName })
  // Les cinq langues distinguent simplement un et plusieurs : deux formulations suffisent,
  // sans avoir à embarquer de règles de pluriel.
  let body: string
  if (input.artifacts > 0) body = input.artifacts === 1 ? t.push.nudgeArtifactsOne : fmt(t.push.nudgeArtifacts, { count: input.artifacts })
  else if (input.notes > 0) body = input.notes === 1 ? t.push.nudgeNotesOne : fmt(t.push.nudgeNotes, { count: input.notes })
  else body = fmt(t.push.nudgeIdle, { app: input.appName })
  return { title, body, url: `/${input.appSlug}`, tag: `nudge-${input.appSlug}`, icon: appIconPath(input.appSlug) }
}

/** Taille maximale d'un message push acceptée partout (4 Ko chiffrés) : on reste très en dessous. */
export function serializePayload(payload: PushPayload): string {
  return JSON.stringify({
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 240),
    url: payload.url.slice(0, 200),
    tag: payload.tag.slice(0, 60),
    ...(payload.icon ? { icon: payload.icon.slice(0, 120) } : {}),
  })
}
