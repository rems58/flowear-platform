// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Composer } from '@/components/chat/composer'
import { I18nProvider } from '@/lib/i18n/provider'

afterEach(cleanup)

type Result = { transcript: string }[] & { isFinal: boolean }
type ResultEvent = { resultIndex: number; results: Result[] }

/** Faux moteur de reconnaissance : on lui injecte des événements comme Android Chrome les envoie. */
class FakeRecognition {
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((e: ResultEvent) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  static created = 0
  constructor() {
    FakeRecognition.created++
    FakeRecognition.last = this
  }
  static last: FakeRecognition | null = null
  start() {}
  stop() {
    this.onend?.()
  }
  /** Android : fin de reconnaissance sans que la personne ait rien demandé. */
  endsByItself() {
    this.onerror?.({ error: 'no-speech' })
    this.onend?.()
  }
}
const current = () => FakeRecognition.last!

function result(transcript: string, isFinal: boolean): Result {
  const r = [{ transcript }] as Result
  r.isFinal = isFinal
  return r
}

beforeEach(() => {
  FakeRecognition.last = null
  FakeRecognition.created = 0
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
})

describe('dictée vocale', () => {
  it('ne duplique pas les résultats cumulatifs d Android', () => {
    render(
      <I18nProvider locale="fr">
        <Composer disabled={false} streaming={false} placeholder="Écris" onSend={() => undefined} onStop={() => undefined} />
      </I18nProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /dicter/i }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    // Android : la même phrase revient, de plus en plus longue, marquée définitive à chaque fois.
    act(() => current().onresult!({ resultIndex: 0, results: [result("j'ai", true)] }))
    act(() => current().onresult!({ resultIndex: 0, results: [result("j'ai le", true)] }))
    act(() => current().onresult!({ resultIndex: 0, results: [result("j'ai le contrat", true)] }))
    expect(textarea.value).toBe("j'ai le contrat")
    // Une seconde phrase, provisoire puis définitive.
    act(() => current().onresult!({ resultIndex: 1, results: [result("j'ai le contrat", true), result('à résilier', false)] }))
    expect(textarea.value).toBe("j'ai le contrat à résilier")
    act(() => current().onresult!({ resultIndex: 1, results: [result("j'ai le contrat", true), result('à résilier depuis un mois', true)] }))
    expect(textarea.value).toBe("j'ai le contrat à résilier depuis un mois")
  })

  it('remplace un résultat qui reprend le précédent depuis le début (Android, nouvelles entrées cumulatives)', () => {
    render(
      <I18nProvider locale="fr">
        <Composer disabled={false} streaming={false} placeholder="Écris" onSend={() => undefined} onStop={() => undefined} />
      </I18nProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /dicter/i }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    act(() => current().onresult!({ resultIndex: 0, results: [result('salut', true)] }))
    act(() => current().onresult!({ resultIndex: 1, results: [result('salut', true), result('salut tu', true)] }))
    act(() => current().onresult!({ resultIndex: 2, results: [result('salut', true), result('salut tu', true), result('Salut tu vas bien', true)] }))
    expect(textarea.value).toBe('Salut tu vas bien')
    // Une vraie seconde phrase, qui ne reprend pas la première, s'ajoute.
    act(() => current().onresult!({ resultIndex: 3, results: [result('salut', true), result('salut tu', true), result('Salut tu vas bien', true), result('et toi', true)] }))
    expect(textarea.value).toBe('Salut tu vas bien et toi')
  })

  it('écrit la dictée à la suite du texte déjà tapé, et une seconde dictée à la suite de la première', () => {
    render(
      <I18nProvider locale="fr">
        <Composer disabled={false} streaming={false} placeholder="Écris" onSend={() => undefined} onStop={() => undefined} />
      </I18nProvider>
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Bonjour' } })
    fireEvent.click(screen.getByRole('button', { name: /dicter/i }))
    act(() => current().onresult!({ resultIndex: 0, results: [result('à toi', true)] }))
    expect(textarea.value).toBe('Bonjour à toi')
    fireEvent.click(screen.getByRole('button', { name: /arrêter la dictée/i }))
    fireEvent.click(screen.getByRole('button', { name: /dicter/i }))
    act(() => current().onresult!({ resultIndex: 0, results: [result('et bonne journée', true)] }))
    expect(textarea.value).toBe('Bonjour à toi et bonne journée')
  })

  it('relance la reconnaissance quand Android la coupe, sans perdre le texte, et s arrête à l envoi', () => {
    const onSend = vi.fn()
    render(
      <I18nProvider locale="fr">
        <Composer disabled={false} streaming={false} placeholder="Écris" onSend={onSend} onStop={() => undefined} />
      </I18nProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /dicter/i }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    act(() => current().onresult!({ resultIndex: 0, results: [result('salut tu vas bien', true)] }))
    // Pause : Android coupe. Une nouvelle reconnaissance doit repartir, et le bouton rester « arrêter ».
    act(() => current().endsByItself())
    expect(FakeRecognition.created).toBe(2)
    expect(screen.getByRole('button', { name: /arrêter la dictée/i })).toBeTruthy()
    act(() => current().onresult!({ resultIndex: 0, results: [result('et toi', true)] }))
    expect(textarea.value).toBe('salut tu vas bien et toi')
    // Envoi : le micro s'arrête, plus de relance.
    fireEvent.submit(textarea.closest('form')!)
    expect(onSend).toHaveBeenCalledWith('salut tu vas bien et toi')
    expect(FakeRecognition.created).toBe(2)
    expect(screen.getByRole('button', { name: /dicter/i })).toBeTruthy()
  })
})
