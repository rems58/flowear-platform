// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { UIMessage } from 'ai'
import { MessageItem } from '@/components/chat/message-item'
import { I18nProvider } from '@/lib/i18n/provider'

describe('MessageItem', () => {
  it('rend une fiche en carte et le Markdown sans HTML brut', () => {
    const message: UIMessage = {
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Voilà **ton plan** <img src=x onerror=alert(1)>' },
        {
          type: 'tool-create_fiche',
          toolCallId: 'c1',
          state: 'output-available',
          input: {},
          output: {
            artifactId: 'a1',
            title: 'Courir 10 km',
            goal: 'Finir sans marcher',
            steps: [
              { title: 'Semaine 1', detail: 'Trois sorties courtes' },
              { title: 'Semaine 2', detail: 'Une sortie longue' },
            ],
            tips: ['Dors assez'],
          },
        } as UIMessage['parts'][number],
      ],
    }
    render(
      <I18nProvider locale="fr">
        <MessageItem message={message} brand={{ from: '#000000', to: '#333333', glyph: 'R' }} appSlug="remy" appName="Rémy" initialFeedback={null} />
      </I18nProvider>
    )
    expect(screen.getByText('Courir 10 km')).toBeTruthy()
    expect(screen.getByText('Trois sorties courtes')).toBeTruthy()
    expect(screen.getByText('Dors assez')).toBeTruthy()
    expect(screen.getByText('ton plan').tagName).toBe('STRONG')
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByLabelText('Utile')).toBeTruthy()
  })

  it('affiche une puce pendant qu’un outil tourne', () => {
    const message: UIMessage = {
      id: 'm2',
      role: 'assistant',
      parts: [{ type: 'tool-create_comparatif', toolCallId: 'c2', state: 'input-streaming', input: {} } as UIMessage['parts'][number]],
    }
    render(
      <I18nProvider locale="fr">
        <MessageItem message={message} brand={{ from: '#000000', to: '#333333', glyph: 'R' }} appSlug="remy" appName="Rémy" initialFeedback={null} />
      </I18nProvider>
    )
    expect(screen.getByText(/construit un comparatif/)).toBeTruthy()
  })
})
