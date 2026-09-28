import { describe, expect, it } from 'vitest'
import { countryFromTimezone, helplineFor } from '@/core/safety/helplines'

describe('numéros d aide par pays', () => {
  it('déduit le pays du fuseau, y compris les pays à plusieurs fuseaux', () => {
    expect(countryFromTimezone('Europe/Paris')).toBe('FR')
    expect(countryFromTimezone('America/Sao_Paulo')).toBe('BR')
    expect(countryFromTimezone('America/Argentina/Buenos_Aires')).toBe('AR')
    expect(countryFromTimezone('Australia/Sydney')).toBe('AU')
    expect(countryFromTimezone('America/Indiana/Indianapolis')).toBe('US')
    expect(countryFromTimezone('Asia/Tokyo')).toBeNull()
    expect(countryFromTimezone(undefined)).toBeNull()
  })

  it('donne le bon numéro : France 3114, Belgique 0800 32 123, États-Unis 988, Brésil 188, Espagne 024', () => {
    expect(helplineFor('Europe/Paris', 'fr').lines[0].number).toBe('3114')
    expect(helplineFor('Europe/Brussels', 'fr').lines[0].number).toBe('0800 32 123')
    expect(helplineFor('America/New_York', 'en').lines[0].number).toBe('988')
    expect(helplineFor('America/Sao_Paulo', 'es').lines[0].number).toBe('188')
    expect(helplineFor('Europe/Madrid', 'es').lines[0].number).toBe('024')
  })

  it('sans fuseau connu, se rabat sur la langue, puis sur l annuaire mondial', () => {
    expect(helplineFor(undefined, 'de').country).toBe('DE')
    expect(helplineFor('Asia/Tokyo', 'it').country).toBe('IT')
    const x = helplineFor('Asia/Tokyo', 'xx' as never)
    expect(x.country).toBe('XX')
    expect(x.directory).toContain('findahelpline')
  })
})
