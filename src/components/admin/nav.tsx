'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export interface NavItem {
  href: string
  label: string
  icon: ReactNode
  /** Actif seulement sur cette adresse exacte (la racine de l'admin, sinon elle serait toujours active). */
  exact?: boolean
  badge?: number
}

/** Liste de liens de la colonne, avec l'entrée courante en surbrillance. */
export function AdminNav({ items, className = '', horizontal = false }: { items: NavItem[]; className?: string; horizontal?: boolean }) {
  const pathname = usePathname()
  return (
    <nav className={`${horizontal ? 'flex gap-1' : 'flex flex-col gap-0.5'} ${className}`}>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-200 ${active ? 'bg-black/[0.06] font-medium dark:bg-white/[0.1]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}`}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon}
            {item.label}
            {item.badge ? <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{item.badge}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}
