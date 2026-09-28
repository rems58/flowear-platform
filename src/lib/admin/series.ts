import type { DailyActivity } from '@/core/data/types'

/** Les `n` derniers jours UTC, du plus ancien au plus récent, au format `AAAA-MM-JJ`. */
export function lastDays(n: number, now: Date): string[] {
  return Array.from({ length: n }, (_, i) => new Date(now.getTime() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10))
}

/** Une valeur par jour, toutes IA confondues, les jours sans activité à zéro. */
export function sumByDay(activity: DailyActivity[], days: string[], value: (d: DailyActivity) => number): number[] {
  return days.map((day) => activity.filter((a) => a.day === day).reduce((s, a) => s + value(a), 0))
}

/** Part d'un tout, `null` quand il n'y a rien à diviser : l'affichage dira « n/d », pas « 0 % ». */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}
