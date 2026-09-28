/**
 * Prochain passage d'un rappel : une heure locale « HH:MM » dans un fuseau IANA, traduite
 * en instant UTC. Sans bibliothèque : `Intl` donne la date locale d'un instant, on ajuste
 * l'instant jusqu'à ce que sa date locale soit celle voulue (deux passages suffisent, y
 * compris autour d'un changement d'heure).
 */

export const TIME_LOCAL_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** 1 = lundi ... 7 = dimanche */
  weekday: number
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

/** Date et heure locales d'un instant dans un fuseau. */
export function localParts(at: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: WEEKDAYS[get('weekday')] ?? 1,
  }
}

/** Instant UTC correspondant à une date et heure locales dans un fuseau. */
export function zonedToUtc(local: { year: number; month: number; day: number; hour: number; minute: number }, timezone: string): Date {
  let guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
  // Deux corrections : la première rapproche du bon décalage, la seconde absorbe un
  // changement d'heure entre les deux estimations.
  for (let i = 0; i < 2; i++) {
    const seen = localParts(new Date(guess), timezone)
    const seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)
    guess += Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - seenUtc
  }
  return new Date(guess)
}

export interface Schedule {
  timeLocal: string
  timezone: string
  /** 1 = lundi ... 7 = dimanche ; null = tous les jours. */
  days: number[] | null
}

/**
 * Prochain passage strictement après `from`. Parcourt au plus huit jours locaux : avec des
 * jours valides, il y en a toujours un dans la semaine.
 */
export function nextRun(schedule: Schedule, from: Date): Date {
  if (!TIME_LOCAL_RE.test(schedule.timeLocal)) throw new Error(`Heure invalide : ${schedule.timeLocal}`)
  const [hour, minute] = schedule.timeLocal.split(':').map(Number)
  const start = localParts(from, schedule.timezone)
  for (let offset = 0; offset <= 8; offset++) {
    // Date locale du jour courant + offset, calculée en UTC pour éviter les débordements de mois.
    const d = new Date(Date.UTC(start.year, start.month - 1, start.day + offset))
    const candidate = zonedToUtc({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour, minute }, schedule.timezone)
    if (candidate.getTime() <= from.getTime()) continue
    if (schedule.days && !schedule.days.includes(localParts(candidate, schedule.timezone).weekday)) continue
    return candidate
  }
  throw new Error('Aucun passage trouvé')
}
