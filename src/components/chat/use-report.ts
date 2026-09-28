'use client'

import { useState } from 'react'
import type { ReportBody } from '@/core/reports/schema'

export type ReportState = 'idle' | 'sending' | 'sent' | 'failed'

/**
 * Envoi d'un signalement, partagé par le bouton sous une réponse et le formulaire du menu :
 * même route, même machine à états, deux mises en forme.
 */
export function useReport(appSlug: string) {
  const [state, setState] = useState<ReportState>('idle')
  async function send(body: ReportBody): Promise<void> {
    if (state === 'sending') return
    setState('sending')
    try {
      const res = await fetch(`/api/v1/${appSlug}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      setState(res.ok ? 'sent' : 'failed')
    } catch {
      setState('failed')
    }
  }
  return { state, send, reset: () => setState('idle') }
}
