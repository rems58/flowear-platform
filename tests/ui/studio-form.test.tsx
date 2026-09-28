// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StudioForm } from '@/components/studio/studio-form'
import { I18nProvider } from '@/lib/i18n/provider'

describe('formulaire de la liste d’attente Studio', () => {
  afterEach(() => cleanup())

  it('masque le compteur tant qu’il y a moins de 5 inscrits', () => {
    for (const n of [0, 1, 4]) {
      render(
        <I18nProvider locale="fr">
          <StudioForm initialCount={n} />
        </I18nProvider>
      )
      expect(screen.queryByText(/sur la liste/)).toBeNull()
      cleanup()
    }
  })

  it('l’affiche à partir de 5', () => {
    render(
      <I18nProvider locale="fr">
        <StudioForm initialCount={5} />
      </I18nProvider>
    )
    expect(screen.getByText(/5 créateurs sur la liste/)).toBeTruthy()
  })
})
