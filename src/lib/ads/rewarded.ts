'use client'

/**
 * Régie de pub récompensée, côté navigateur. Une seule pour l'instant : Google Ad Manager
 * (format « rewarded » du Google Publisher Tag). Le script n'est chargé qu'au premier clic,
 * jamais au chargement de la page. Sans régie configurée, `showRewardedAd` n'est jamais appelé.
 */
declare global {
  interface Window {
    googletag?: {
      cmd: Array<() => void>
      defineOutOfPageSlot: (path: string, format: unknown) => GamSlot | null
      enums: { OutOfPageFormat: { REWARDED: unknown } }
      pubads: () => {
        enableSingleRequest: () => void
        addEventListener: (name: string, cb: (event: { slot: GamSlot; makeRewardedVisible?: () => void }) => void) => void
      }
      enableServices: () => void
      display: (slot: GamSlot) => void
      destroySlots: (slots: GamSlot[]) => void
    }
  }
}
interface GamSlot {
  addService: (s: unknown) => GamSlot
}

export const GAM_ORIGINS = ['https://securepubads.g.doubleclick.net', 'https://pagead2.googlesyndication.com', 'https://tpc.googlesyndication.com', 'https://www.googletagservices.com']

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`script ${src}`))
    document.head.appendChild(s)
  })
}

/**
 * Affiche une vidéo récompensée et résout `true` si la personne est allée au bout
 * (`rewardedSlotGranted`), `false` si elle a fermé avant, ou si aucune pub n'est disponible.
 */
export async function showRewardedAd(provider: 'gam', slotPath: string): Promise<boolean> {
  if (provider !== 'gam') return false
  await loadScript('https://securepubads.g.doubleclick.net/tag/js/gpt.js')
  const gt = window.googletag
  if (!gt) return false
  return new Promise<boolean>((resolve) => {
    gt.cmd.push(() => {
      const slot = gt.defineOutOfPageSlot(slotPath, gt.enums.OutOfPageFormat.REWARDED)
      if (!slot) return resolve(false)
      slot.addService(gt.pubads())
      let granted = false
      const pubads = gt.pubads()
      pubads.addEventListener('rewardedSlotReady', (e) => e.makeRewardedVisible?.())
      pubads.addEventListener('rewardedSlotGranted', () => {
        granted = true
      })
      pubads.addEventListener('rewardedSlotClosed', () => {
        gt.destroySlots([slot])
        resolve(granted)
      })
      pubads.addEventListener('slotRenderEnded', (e) => {
        // Pas de pub servie : la régie n'ouvre rien, on rend la main.
        if ((e as unknown as { isEmpty?: boolean }).isEmpty) {
          gt.destroySlots([slot])
          resolve(false)
        }
      })
      gt.enableServices()
      gt.display(slot)
    })
  })
}
