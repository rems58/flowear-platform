'use client'

import { createContext, useContext } from 'react'

/**
 * Ce que les cartes du fil peuvent faire : envoyer un message de la part de la personne
 * (un choix cliqué, « fait », la fin d'un minuteur) et savoir si elles sont dans la
 * dernière réponse (seules celles-là sont actives : une vieille question ne se répond plus).
 */
export interface ChatActions {
  send: (text: string) => void
  appSlug: string
  busy: boolean
}

export const ChatActionsContext = createContext<ChatActions | null>(null)

export function useChatActions(): ChatActions | null {
  return useContext(ChatActionsContext)
}
