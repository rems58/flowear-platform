import { describe, expect, it } from 'vitest'
import { createBareToolNameGuard, createChoiceLineGuard, createToolJsonGuard } from '@/core/agent/json-guard'
import { askChoice } from '@/core/tools/generic/ask-choice'

const guard = () => createToolJsonGuard([askChoice])
const CALL = '{"question":"Quelle est ton énergie ?","options":["À plat","Moyen"],"saveAs":{"kind":"none"}}'

function run(g: ReturnType<typeof guard>, deltas: string[]): string {
  return deltas.flatMap((d) => g.push(d)).join('') + g.flush()
}

describe('garde JSON du flux texte', () => {
  it('jette un appel d outil écrit en texte, garde ce qui l entoure', () => {
    expect(run(guard(), [`Bien joué ! Quelle tâche maintenant ?${CALL}Quelle est ton énergie ?`])).toBe('Bien joué ! Quelle tâche maintenant ?Quelle est ton énergie ?')
  })

  it('fonctionne quel que soit le découpage en deltas', () => {
    const text = `Bien joué.${CALL} Et toi ?`
    for (const size of [1, 3, 7, 50]) {
      const deltas: string[] = []
      for (let i = 0; i < text.length; i += size) deltas.push(text.slice(i, i + size))
      expect(run(guard(), deltas)).toBe('Bien joué. Et toi ?')
    }
  })

  it('rend tel quel un objet qui n est pas une entrée d outil, et les accolades du texte courant', () => {
    expect(run(guard(), ['Un exemple : {"a": 1} voilà.'])).toBe('Un exemple : {"a": 1} voilà.')
    expect(run(guard(), ['Une accolade { seule, jamais fermée'])).toBe('Une accolade { seule, jamais fermée')
    expect(run(guard(), ['Des guillemets "avec } dedans" et {"question":"x\\"}y"} fin'])).toBe('Des guillemets "avec } dedans" et {"question":"x\\"}y"} fin')
  })

  it('ne retient pas un bloc trop long', () => {
    const long = '{' + 'a'.repeat(5000)
    expect(run(guard(), [long, '}']).length).toBe(long.length + 1)
  })

  it('retire une note que le modèle s adresse à lui-même, garde les parenthèses normales', () => {
    expect(run(guard(), ['Super, le dentiste est contacté. (Note: The last message should be the final answer.) À plus.'])).toBe('Super, le dentiste est contacté.  À plus.')
    expect(run(guard(), ['Super (vraiment) bien joué (et vite).'])).toBe('Super (vraiment) bien joué (et vite).')
    expect(run(guard(), ['Ouvre le mail (celui de la CAF) et réponds.'])).toBe('Ouvre le mail (celui de la CAF) et réponds.')
    // Découpage arbitraire des deltas.
    const text = 'Bien. (Note: keep it short) Suite.'
    for (const size of [1, 2, 5]) {
      const deltas: string[] = []
      for (let i = 0; i < text.length; i += size) deltas.push(text.slice(i, i + size))
      expect(run(guard(), deltas)).toBe('Bien.  Suite.')
    }
    expect(run(guard(), ['Une parenthèse ouverte (jamais fermée'])).toBe('Une parenthèse ouverte (jamais fermée')
  })
})

describe('garde des noms d outil écrits en titre', () => {
  const names = ['next_action', 'ask_choice', 'brain_dump']
  const run = (deltas: string[]) => {
    const g = createBareToolNameGuard(names)
    return deltas.flatMap((d) => g.push(d)).join('') + g.flush()
  }

  it('jette une ligne qui n est qu un nom d outil décoré, seule ou parmi du texte', () => {
    expect(run(['--- next_', 'action ---'])).toBe('')
    expect(run(['**ask_choice**'])).toBe('')
    expect(run(['[brain_dump]\n'])).toBe('\n')
    expect(run(['Bien joué.\n--- next_action ---\nOn continue.'])).toBe('Bien joué.\n\nOn continue.')
  })

  it('laisse passer le texte courant sans le retarder, même s il commence comme un nom d outil', () => {
    const g = createBareToolNameGuard(names)
    expect(g.push('Bravo, ').join('')).toBe('Bravo, ')
    expect(g.push('next étape : ').join('')).toBe('next étape : ')
    expect(g.push('le mail.').join('') + g.flush()).toBe('le mail.')
    expect(run(['next_action est un outil'])).toBe('next_action est un outil')
    expect(run(['- - -'])).toBe('- - -')
  })
})

describe('garde des boutons écrits en texte', () => {
  const sets = [['À plat', 'Moyen', 'En forme'], ['Low', 'Medium', 'High']]
  const run = (deltas: string[]) => {
    const g = createChoiceLineGuard(sets)
    const text = deltas.flatMap((d) => g.push(d)).join('') + g.flush()
    return { text, dropped: g.dropped }
  }

  it('jette la ligne qui liste les trois choix, garde le reste, et le signale', () => {
    expect(run(['Comment tu te sens ?\nOptions : « À plat », « Moyen »', ', « En forme ».'])).toEqual({ text: 'Comment tu te sens ?\n', dropped: true })
    expect(run(['Pick one: Low, Medium or High'])).toEqual({ text: '', dropped: true })
  })

  it('laisse passer une phrase qui ne cite qu un choix, et rend une longue ligne sans attendre sa fin', () => {
    expect(run(['Tu es ', 'à plat, je vois.'])).toEqual({ text: 'Tu es à plat, je vois.', dropped: false })
    const g = createChoiceLineGuard(sets)
    const long = 'x'.repeat(130)
    // Rendue dès qu'elle dépasse la garde, puis au fil de l'eau.
    expect(g.push(long).join('')).toBe(long)
    expect(g.push(' suite').join('')).toBe(' suite')
    expect(g.flush()).toBe('')
  })
})
