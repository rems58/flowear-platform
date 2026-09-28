/**
 * « dans 2 minutes », « in 20 min », « en 1 hora », « in 2 Stunden », « tra 10 minuti » : un délai
 * relatif dit par la personne. Lu par le code, parce que le modèle transforme « dans 2 minutes »
 * en heure « 00:02 » tous les jours. Renvoie des minutes, ou null.
 */
const UNIT_MIN = /^(min|mins|minute|minutes|minuto|minutos|minuti|minuten)$/i
const UNIT_HOUR = /^(h|hr|hrs|heure|heures|hour|hours|hora|horas|ora|ore|stunde|stunden)$/i
const RE = /(?:\b(?:dans|in|en|tra|fra)\s+)(\d{1,3})\s*(min|mins|minutes?|minutos?|minuti|minuten|h|hrs?|heures?|hours?|horas?|ora|ore|stunden?)\b/i

export function relativeMinutes(text: string): number | null {
  const m = RE.exec(text)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = m[2]
  if (UNIT_MIN.test(unit)) return n
  if (UNIT_HOUR.test(unit)) return n * 60
  return null
}
