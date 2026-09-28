import type { ToolDefinition } from '@/core/tools/types'

/**
 * Filet contre un défaut connu des modèles ouverts (gpt-oss entre autres) : quand ils veulent
 * parler ET appeler un outil dans le même souffle, ils écrivent parfois l'appel en texte,
 * « Bien joué ! {"question":"…","options":[…]} ». La personne voit du JSON.
 *
 * Le garde lit le texte au fil des deltas. Hors accolade, il laisse passer. À une accolade
 * ouvrante suivie d'un guillemet (début d'objet JSON), il retient tout jusqu'à l'accolade
 * fermante équilibrée : si le bloc est un objet qui valide l'entrée d'un outil disponible,
 * il est jeté ; sinon il est rendu tel quel. Un bloc jamais fermé est rendu à la fin du texte.
 */
export interface ToolJsonGuard {
  /** Reçoit un delta, renvoie ce qui peut être affiché tout de suite (zéro, un ou deux morceaux). */
  push(delta: string): string[]
  /** Fin du texte : ce qui restait en attente, rendu tel quel. */
  flush(): string
}

const MAX_BUFFER = 4000

/** Notes que le modèle s'adresse à lui-même et laisse dans la réponse : « (Note: the last message should… ) ». */
const META_NOTE_RE = /^\(\s*(note|nota|hinweis|remarque)\s*:/i
const META_HEAD = 12

export function createToolJsonGuard(tools: readonly ToolDefinition[]): ToolJsonGuard {
  let buffer = ''
  let depth = 0
  let inString = false
  let escaped = false
  // Parenthèse ouverte : retenue le temps de voir si c'est une note pour soi (« (Note: … ) »).
  let paren = ''
  let inMetaNote = false

  function looksLikeToolInput(text: string): boolean {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return false
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    return tools.some((t) => t.input.safeParse(parsed).success)
  }

  return {
    push(delta) {
      const out: string[] = []
      let plain = ''
      for (let i = 0; i < delta.length; i++) {
        const ch = delta[i]
        if (depth === 0 && (paren || inMetaNote)) {
          paren += ch
          if (inMetaNote) {
            if (ch === ')') {
              inMetaNote = false
              paren = ''
            }
            continue
          }
          if (META_NOTE_RE.test(paren)) {
            inMetaNote = true
            continue
          }
          // Assez de caractères pour savoir que ce n'est pas une note, ou parenthèse fermée : on rend.
          if (paren.length >= META_HEAD || ch === ')' || !/^\(\s*[a-zé]*:?$/i.test(paren)) {
            plain += paren
            paren = ''
          }
          continue
        }
        if (depth === 0) {
          if (ch === '(') {
            paren = '('
            continue
          }
          // Début d'un bloc : retenu jusqu'à sa fermeture. Une accolade dans du texte courant
          // est rare, et le bloc est rendu tel quel s'il ne ressemble pas à un appel d'outil.
          if (ch === '{') {
            if (plain) out.push(plain)
            plain = ''
            buffer = '{'
            depth = 1
            inString = false
            escaped = false
            continue
          }
          plain += ch
          continue
        }
        buffer += ch
        if (inString) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') inString = false
        } else if (ch === '"') inString = true
        else if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) {
            if (!looksLikeToolInput(buffer)) plain += buffer
            buffer = ''
          }
        }
        if (buffer.length > MAX_BUFFER) {
          // Trop long pour être un appel d'outil : on rend tout et on reprend le fil.
          plain += buffer
          buffer = ''
          depth = 0
          inString = false
        }
      }
      if (plain) out.push(plain)
      return out
    },
    flush() {
      const rest = buffer + (inMetaNote ? '' : paren)
      buffer = ''
      depth = 0
      inString = false
      paren = ''
      inMetaNote = false
      return rest
    },
  }
}

/**
 * Second défaut du même modèle : au lieu d'appeler l'outil, il écrit son nom en titre,
 * « --- next_action --- », seul sur sa ligne, et s'arrête. Ce garde retient une ligne tant
 * qu'elle peut encore n'être qu'un nom d'outil décoré, la jette si c'en est un, la rend sinon.
 * Le texte courant n'est pas retardé : dès qu'une ligne s'écarte du motif, elle passe.
 */
const DECOR = /[\s\-—–*_#\[\]()`:>|=]*/
export function createBareToolNameGuard(toolNames: readonly string[]): ToolJsonGuard {
  const names = toolNames.map((n) => n.toLowerCase())
  const bare = new RegExp(`^${DECOR.source}(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})${DECOR.source}$`, 'i')
  let line = ''
  // Une ligne déjà entamée à l'écran ne sera plus retenue : on ne juge que des débuts de ligne.
  let lineStarted = false

  /** La ligne en cours peut-elle encore devenir un nom d'outil seul ? */
  function couldBeBare(text: string): boolean {
    if (text.length > 60) return false
    const stripped = text.replace(/^[\s\-—–*_#\[\]()`:>|=]*/, '')
    const word = stripped.match(/^[a-z_]*/i)?.[0] ?? ''
    if (word.length !== stripped.length && !/^[\s\-—–*_#\[\]()`:>|=]*$/.test(stripped.slice(word.length))) return false
    return names.some((n) => n.startsWith(word.toLowerCase()))
  }

  function settle(text: string): string {
    return bare.test(text) ? '' : text
  }

  return {
    push(delta) {
      const out: string[] = []
      let plain = ''
      for (const ch of delta) {
        if (ch === '\n') {
          plain += settle(line) + '\n'
          line = ''
          lineStarted = false
          continue
        }
        if (lineStarted) {
          plain += ch
          continue
        }
        line += ch
        if (!couldBeBare(line)) {
          plain += line
          line = ''
          lineStarted = true
        }
      }
      if (plain) out.push(plain)
      return out
    },
    flush() {
      const rest = settle(line)
      line = ''
      lineStarted = false
      return rest
    },
  }
}

export interface ChoiceLineGuard extends ToolJsonGuard {
  /** Vrai dès qu'une ligne de « boutons en texte » a été jetée : le code posera la vraie question. */
  readonly dropped: boolean
}

/**
 * Troisième défaut : au lieu d'appeler `ask_choice`, le modèle écrit les boutons en texte,
 * « Options : « À plat », « Moyen », « En forme » ». Ce garde retient une ligne dès qu'elle
 * contient un des libellés d'un jeu de choix connu, la jette si elle les contient tous, la rend
 * sinon. Le texte qui ne parle pas d'un choix n'est pas retardé.
 */
export function createChoiceLineGuard(labelSets: readonly (readonly string[])[]): ChoiceLineGuard {
  const sets = labelSets.map((set) => set.map((l) => l.toLowerCase()))
  const labels = sets.flat()
  // Une ligne est jetée en entier ou gardée en entier : on la retient donc depuis son début,
  // tant qu'elle est courte (une ligne de boutons l'est) ; au-delà de HOLD_MAX sans libellé,
  // elle est rendue et ne sera plus jugée. Le texte long n'attend donc jamais plus que ça.
  const HOLD_MAX = 120
  let held = ''
  let released = false
  let dropped = false

  function full(text: string): boolean {
    const low = text.toLowerCase()
    return sets.some((set) => set.every((l) => low.includes(l)))
  }
  function settle(text: string): string {
    if (full(text)) {
      dropped = true
      return ''
    }
    return text
  }

  return {
    get dropped() {
      return dropped
    },
    push(delta) {
      const out: string[] = []
      let plain = ''
      for (const ch of delta) {
        if (ch === '\n') {
          plain += (released ? '' : settle(held)) + '\n'
          held = ''
          released = false
          continue
        }
        if (released) {
          plain += ch
          continue
        }
        held += ch
        const low = held.toLowerCase()
        if (held.length > HOLD_MAX && !labels.some((l) => low.includes(l))) {
          plain += held
          held = ''
          released = true
        }
      }
      if (plain) out.push(plain)
      return out
    },
    flush() {
      const rest = released ? '' : settle(held)
      held = ''
      released = false
      return rest
    },
  }
}
