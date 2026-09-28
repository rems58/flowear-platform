import 'server-only'
import type { ChatDeps } from '@/core/agent/chat'
import { getRepo } from '@/lib/db/repo'
import { getProviderKeys } from '@/lib/env'
import { getMessages } from '@/lib/i18n/messages'

/** Dépendances de production de la boucle agent. */
export function getChatDeps(): ChatDeps {
  return {
    repo: getRepo(),
    keys: getProviderKeys(),
    messages: getMessages,
    log: (level, message, details) => {
      const line = `[agent] ${message}`
      if (level === 'error') console.error(line, details ?? '')
      else if (level === 'warn') console.warn(line, details ?? '')
      else console.info(line, details ?? '')
    },
  }
}
