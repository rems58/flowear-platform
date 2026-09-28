import { describe, expect, it } from 'vitest'
import { relativeMinutes } from '@/core/checkins/relative'

describe('délai relatif dit par la personne', () => {
  it('lit minutes et heures dans les cinq langues, ignore une heure fixe', () => {
    expect(relativeMinutes('rappelle-moi dans 2 minutes de boire')).toBe(2)
    expect(relativeMinutes('dans 45 min')).toBe(45)
    expect(relativeMinutes('remind me in 20 minutes')).toBe(20)
    expect(relativeMinutes('in 2 hours')).toBe(120)
    expect(relativeMinutes('recuérdame en 10 minutos')).toBe(10)
    expect(relativeMinutes('erinnere mich in 1 Stunde')).toBe(60)
    expect(relativeMinutes('ricordami tra 15 minuti')).toBe(15)
    expect(relativeMinutes('rappelle-moi chaque jour à 21h')).toBeNull()
    expect(relativeMinutes('à 8h30')).toBeNull()
  })
})
