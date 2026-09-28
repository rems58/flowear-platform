import type { en } from './en'

/** Même structure que l'anglais, valeurs libres : chaque langue doit remplir toutes les clés. */
type Loosen<T> = { [K in keyof T]: T[K] extends string ? string : Loosen<T[K]> }
export type Messages = Loosen<typeof en>
