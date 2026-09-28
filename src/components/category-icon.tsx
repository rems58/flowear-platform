import { Coffee, Flower2, GraduationCap, HeartPulse, MessageCircle, PiggyBank, Zap, type LucideIcon } from 'lucide-react'
import type { CategoryId } from '@/apps/types'

/** Une icône et une couleur unie par catégorie, façon App Store. Pas d'emoji, pas de dégradé. */
export const CATEGORY_STYLE: Record<CategoryId, { Icon: LucideIcon; color: string }> = {
  assistant: { Icon: MessageCircle, color: '#5E5CE6' },
  beauty: { Icon: Flower2, color: '#FF2D55' },
  health: { Icon: HeartPulse, color: '#34C759' },
  productivity: { Icon: Zap, color: '#FF9500' },
  finance: { Icon: PiggyBank, color: '#30B0C7' },
  learning: { Icon: GraduationCap, color: '#AF52DE' },
  lifestyle: { Icon: Coffee, color: '#A2845E' },
}

/** Indigo du logo Flowear : la couleur unique de tous les glyphes du hub. */
export const FLOWEAR_INDIGO = '#5E5CE6'

/** Glyphe de catégorie, en trait fin, dans l'indigo Flowear (`colored` : couleur propre de la catégorie). */
export function CategoryIcon({ id, colored = false, size = 16, className = '' }: { id: CategoryId; colored?: boolean; size?: number; className?: string }) {
  const { Icon, color } = CATEGORY_STYLE[id]
  return <Icon className={className} style={{ color: colored ? color : FLOWEAR_INDIGO, width: size, height: size }} strokeWidth={1.75} aria-hidden />
}
