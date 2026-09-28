'use client'

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { SendHorizontal, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n/provider'
import { VoiceButton } from './voice-button'

export const MAX_MESSAGE_CHARS = 4000

interface ComposerProps {
  disabled: boolean
  streaming: boolean
  placeholder: string
  /** Langue de la dictée vocale (BCP 47). */
  lang?: string
  onSend: (text: string) => void
  onStop: () => void
}

/** Zone de saisie : Entrée envoie, Maj+Entrée saute une ligne, longueur bornée. */
export function Composer({ disabled, streaming, placeholder, lang = 'en-US', onSend, onStop }: ComposerProps) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  // Texte présent avant la dictée en cours : la dictée s'écrit à sa suite, jamais par-dessus.
  const committedRef = useRef('')
  // Incrémenté à l'envoi : le micro s'arrête, il ne dicte pas dans le message suivant.
  const [stopSignal, setStopSignal] = useState(0)
  const trimmed = text.trim()

  function onTranscript(transcript: string) {
    const base = committedRef.current
    setText(`${base}${base && !base.endsWith(' ') ? ' ' : ''}${transcript}`.slice(0, MAX_MESSAGE_CHARS))
  }
  function onListeningChange(next: boolean) {
    // Au démarrage comme à l'arrêt, ce qui est à l'écran devient la base de la dictée suivante.
    // Lu via la mise à jour fonctionnelle : le rappel du micro a été créé au démarrage, son `text` serait périmé.
    setText((current) => {
      committedRef.current = current
      return current
    })
    setListening(next)
  }

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!trimmed || disabled) return
    onSend(trimmed.slice(0, MAX_MESSAGE_CHARS))
    setText('')
    committedRef.current = ''
    if (listening) setStopSignal((n) => n + 1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={submit} className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">
      <div className="mx-auto flex w-full max-w-2xl items-end gap-1.5 rounded-[28px] bg-card p-1.5 pl-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.05] dark:bg-[#1c1c1e] dark:shadow-none dark:ring-white/[0.08]">
        <Textarea
          value={text}
          onChange={(e) => {
            const v = e.target.value.slice(0, MAX_MESSAGE_CHARS)
            setText(v)
            committedRef.current = v
          }}
          onKeyDown={onKeyDown}
          placeholder={listening ? t.chat.listening : placeholder}
          rows={1}
          maxLength={MAX_MESSAGE_CHARS}
          aria-label={t.chat.yourMessage}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-2.5 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent dark:disabled:bg-transparent"
        />
        <VoiceButton lang={lang} disabled={disabled} onTranscript={onTranscript} onListening={onListeningChange} onError={setVoiceError} stopSignal={stopSignal} />
        {streaming ? (
          <Button type="button" variant="outline" size="icon-lg" className="size-11 rounded-full md:size-10" onClick={onStop} aria-label={t.chat.stop}>
            <Square />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon-lg"
            // 44 px sur téléphone : en dessous, la cible est trop petite pour un pouce.
            className="size-11 rounded-full transition-all disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 md:size-10"
            disabled={disabled || !trimmed}
            aria-label={t.chat.send}
          >
            <SendHorizontal />
          </Button>
        )}
      </div>
      {voiceError ? (
        <p role="alert" className="mx-auto mt-2 w-full max-w-2xl px-4 text-center text-xs text-destructive">
          {voiceError}
        </p>
      ) : null}
    </form>
  )
}
