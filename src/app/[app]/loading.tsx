/**
 * Squelette affiché dès le clic, le temps que la page d'une IA charge ses données : la barre,
 * le menu de gauche et la zone d'écriture, sans contenu. Aucune donnée, aucune logique.
 */
export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy aria-live="polite">
      <div className="sticky top-0 flex items-center gap-3 border-b border-black/5 px-3 py-2 md:px-4 md:py-2.5 dark:border-white/10">
        <div className="size-8 rounded-full bg-black/[0.06] md:hidden dark:bg-white/[0.1]" />
        <div className="hidden size-[30px] rounded-xl bg-black/[0.06] md:block dark:bg-white/[0.1]" />
        <div className="h-4 w-24 rounded bg-black/[0.06] dark:bg-white/[0.1]" />
      </div>
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 flex-col gap-3 border-r border-black/5 px-3 py-4 md:flex dark:border-white/10">
          <div className="h-8 rounded-full bg-black/[0.06] dark:bg-white/[0.1]" />
          <div className="h-8 rounded-full bg-black/[0.04] dark:bg-white/[0.06]" />
          <div className="mt-2 h-40 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]" />
          <div className="mt-4 flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 rounded-xl bg-black/[0.03] dark:bg-white/[0.05]" />
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1" />
          <div className="mx-auto w-full max-w-2xl px-4 pb-4">
            <div className="h-14 rounded-3xl bg-black/[0.06] dark:bg-white/[0.1]" />
          </div>
        </div>
      </div>
    </div>
  )
}
