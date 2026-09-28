'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { BRAND_IMAGE_MAX } from '@/apps/types'
import { useI18n } from '@/lib/i18n/provider'

const SIZE = 256

/**
 * Logo en image : la personne choisit un fichier, l'image est recadrée en carré au centre,
 * avec un zoom et un déplacement, puis réduite à 256 px. Le résultat part en PNG, ou en JPEG
 * sur fond blanc s'il est trop lourd (photo). Rien n'est envoyé avant la sauvegarde du brouillon.
 */
export function LogoPicker({ image, background, onChange }: { image: string | undefined; background: [string, string]; onChange: (image: string | undefined) => void }) {
  const { t } = useI18n()
  const [source, setSource] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [error, setError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function load(file: File | undefined) {
    setError(false)
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 10_000_000) {
      setError(true)
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      setSource(img)
      setZoom(1)
      setX(0)
      setY(0)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setError(true)
    }
    img.src = url
  }

  // Recadrage : le plus petit côté remplit le carré, le zoom resserre, x et y déplacent le cadre.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!source || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const side = Math.min(source.naturalWidth, source.naturalHeight) / zoom
    const maxX = (source.naturalWidth - side) / 2
    const maxY = (source.naturalHeight - side) / 2
    const sx = maxX + x * maxX
    const sy = maxY + y * maxY
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.drawImage(source, sx, sy, side, side, 0, 0, SIZE, SIZE)
  }, [source, zoom, x, y])

  function apply() {
    const canvas = canvasRef.current
    if (!canvas) return
    let data = canvas.toDataURL('image/png')
    if (data.length > BRAND_IMAGE_MAX) {
      // Trop lourd en PNG (une photo) : JPEG sur fond blanc.
      const flat = document.createElement('canvas')
      flat.width = SIZE
      flat.height = SIZE
      const ctx = flat.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.drawImage(canvas, 0, 0)
      data = flat.toDataURL('image/jpeg', 0.85)
    }
    if (data.length > BRAND_IMAGE_MAX) {
      setError(true)
      return
    }
    onChange(data)
    setSource(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t.creator.logoHint}</p>
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-input px-4 py-2 text-sm hover:bg-muted">
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
        {image ? t.creator.logoReplace : t.creator.logoUpload}
      </label>
      {source ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08] sm:flex-row sm:items-start">
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="size-40 shrink-0 rounded-[36px]"
            style={{ background: `linear-gradient(145deg, ${background[0]} 0%, ${background[1]} 100%)` }}
          />
          <div className="flex grow flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1">
              {t.creator.logoZoom}
              <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              {t.creator.logoMoveX}
              <input type="range" min={-1} max={1} step={0.02} value={x} onChange={(e) => setX(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              {t.creator.logoMoveY}
              <input type="range" min={-1} max={1} step={0.02} value={y} onChange={(e) => setY(Number(e.target.value))} />
            </label>
            <div className="flex gap-2">
              <Button type="button" size="sm" className="cursor-pointer rounded-full text-white hover:opacity-90" style={{ background: '#5E5CE6' }} onClick={apply}>
                {t.creator.logoApply}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="cursor-pointer" onClick={() => setSource(null)}>
                {t.creator.logoCancel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{t.creator.logoInvalid}</p> : null}
    </div>
  )
}
