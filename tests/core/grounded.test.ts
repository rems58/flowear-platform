import { describe, expect, it } from 'vitest'
import { groundedItems, isGroundedIn } from '@/core/tools/grounded'

describe('ancrage des éléments extraits dans les mots de la personne', () => {
  it('garde une reformulation qui partage un nom, un nombre ou une racine, jette une invention', () => {
    const msg = 'je dois rappeler le dentiste, payer la CAF, ranger la cuisine, j’en peux plus'
    expect(isGroundedIn('Appeler le dentiste', msg)).toBe(true)
    expect(isGroundedIn('Payer la CAF', msg)).toBe(true)
    expect(isGroundedIn('Rangement de la cuisine', msg)).toBe(true)
    expect(isGroundedIn('Lister les tâches en suspens', msg)).toBe(false)
    expect(isGroundedIn('Lister les tâches en suspens', 'désolé j’ai tout lâché trois jours')).toBe(false)
    expect(isGroundedIn('Réviser le chapitre 12', 'faut que je révise le 12 avant jeudi')).toBe(true)
  })

  it('sans message connu, garde tout', () => {
    expect(groundedItems([{ t: 'x' }], undefined, (i) => i.t)).toEqual([{ t: 'x' }])
    expect(groundedItems([{ t: 'Payer le loyer' }, { t: 'Méditer' }], 'je dois payer le loyer', (i) => i.t)).toEqual([{ t: 'Payer le loyer' }])
  })
})
