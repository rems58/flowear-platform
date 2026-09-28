'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/provider'
import type { Messages } from '@/lib/i18n/messages'

type RecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
}

function getRecognition(): (new () => RecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface VoiceButtonProps {
  lang?: string
  disabled?: boolean
  /**
   * Reçoit TOUT le texte reconnu depuis le début de la dictée, à chaque mise à jour. Le
   * composeur le pose à la suite de ce qu'il y avait avant : il n'accumule jamais lui-même.
   * Android Chrome renvoie des résultats cumulatifs et les marque définitifs à chaque mot ;
   * accumuler côté client donnait « j'ai j'ai le j'ai le contrat… ».
   */
  onTranscript: (text: string) => void
  /** Écoute en cours ou non, pour adapter la zone de saisie. */
  onListening?: (listening: boolean) => void
  /** Message d'erreur lisible (permission refusée, pas de réseau, aucun son). */
  onError?: (message: string | null) => void
  /** Change de valeur quand le composeur veut arrêter la dictée (message envoyé). */
  stopSignal?: number
}

/** Erreurs après lesquelles on relance : Android coupe à la moindre pause de parole. */
const RESTARTABLE_ERRORS = new Set(['no-speech', 'aborted'])

/** Erreur de l'API Web Speech → clé du dictionnaire (chaîne vide = silencieux). */
const ERROR_KEYS: Record<string, keyof Messages['voice'] | ''> = {
  'not-allowed': 'notAllowed',
  'service-not-allowed': 'serviceNotAllowed',
  'audio-capture': 'audioCapture',
  network: 'network',
  'no-speech': 'noSpeech',
  aborted: '',
}

/**
 * Dictée vocale via l'API Web Speech du navigateur : rien ne part vers nos serveurs,
 * le texte apparaît dans la zone de saisie et la personne l'envoie quand elle veut.
 * Masqué si le navigateur ne le supporte pas (Firefox par exemple).
 */
export function VoiceButton({ lang = 'en-US', disabled = false, onTranscript, onListening, onError, stopSignal = 0 }: VoiceButtonProps) {
  const { t, f } = useI18n()
  // Support connu côté client seulement ; le rendu serveur dit « non » pour éviter tout écart d'hydratation.
  const supported = useSyncExternalStore(
    () => () => undefined,
    () => getRecognition() !== null,
    () => false
  )
  const [listening, setListening] = useState(false)
  const recRef = useRef<RecognitionLike | null>(null)
  // La personne veut dicter : tant que c'est vrai, une reconnaissance qui se termine seule
  // (Android coupe à chaque pause) est relancée, et le texte des segments précédents est gardé.
  const wantedRef = useRef(false)
  const accumulatedRef = useRef('')
  const segmentRef = useRef('')

  function stopListening() {
    wantedRef.current = false
    recRef.current?.stop()
  }

  useEffect(() => () => stopListening(), [])
  useEffect(() => {
    if (stopSignal > 0) stopListening()
  }, [stopSignal])

  function joinText(a: string, b: string): string {
    if (!a) return b
    if (!b) return a
    return `${a} ${b}`
  }

  function startRecognition(Ctor: new () => RecognitionLike): boolean {
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    segmentRef.current = ''
    rec.onresult = (e) => {
      // Reconstruit le segment depuis l'index zéro. Sur Mac, chaque entrée est une phrase
      // distincte. Sur Android, chaque mise à jour arrive comme une NOUVELLE entrée qui reprend
      // toute la phrase depuis le début (« salut », « salut tu », « salut tu vas bien ») : une
      // entrée qui commence par la précédente la remplace au lieu de s'y ajouter.
      const parts: string[] = []
      for (let i = 0; i < e.results.length; i++) {
        const text = e.results[i][0]?.transcript?.trim()
        if (!text) continue
        const previous = parts[parts.length - 1]
        if (previous && text.toLowerCase().startsWith(previous.toLowerCase())) parts[parts.length - 1] = text
        else parts.push(text)
      }
      segmentRef.current = parts.join(' ')
      onTranscript(joinText(accumulatedRef.current, segmentRef.current))
    }
    rec.onend = () => {
      // Fin d'un segment : on le garde, et si la personne n'a pas arrêté, on repart aussitôt.
      accumulatedRef.current = joinText(accumulatedRef.current, segmentRef.current)
      segmentRef.current = ''
      if (wantedRef.current && startRecognition(Ctor)) return
      wantedRef.current = false
      setListening(false)
      onListening?.(false)
    }
    rec.onerror = (e) => {
      if (RESTARTABLE_ERRORS.has(e.error)) return // onend suit, et relance si la personne écoute encore
      wantedRef.current = false
      const key = ERROR_KEYS[e.error]
      const msg = key === undefined ? f(t.voice.interrupted, { error: e.error }) : key === '' ? null : t.voice[key]
      onError?.(msg)
    }
    recRef.current = rec
    try {
      rec.start()
      return true
    } catch {
      return false
    }
  }

  function toggle() {
    if (listening) {
      stopListening()
      return
    }
    const Ctor = getRecognition()
    if (!Ctor) return
    onError?.(null)
    accumulatedRef.current = ''
    wantedRef.current = true
    if (startRecognition(Ctor)) {
      setListening(true)
      onListening?.(true)
    } else {
      wantedRef.current = false
      onError?.(t.voice.startFailed)
    }
  }

  if (!supported) return null
  return (
    <Button
      type="button"
      variant={listening ? 'default' : 'ghost'}
      size="icon-lg"
      className={`size-11 rounded-full md:size-10 ${
        listening
          ? 'animate-pulse text-primary-foreground'
          : // Fond discret : sans lui, le micro flottait à côté du bouton d'envoi et ne se
            // lisait pas comme un bouton.
            'bg-black/[0.04] text-muted-foreground hover:bg-black/[0.08] hover:text-foreground dark:bg-white/[0.06] dark:hover:bg-white/[0.12]'
      }`}
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? t.voice.stop : t.voice.start}
    >
      {listening ? <MicOff /> : <Mic />}
    </Button>
  )
}
