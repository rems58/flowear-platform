/**
 * Squelette du hub, le temps de lire la session et la langue. Aucune donnée.
 * Rangé dans le groupe `(hub)` et non à la racine : à la racine, il envelopperait toutes les pages,
 * la réponse partirait en 200 avant qu'une IA inconnue ne soit détectée, et `notFound()` ne
 * pourrait plus renvoyer un vrai 404 (docs Next.js, loading.js, « Status Codes »).
 */
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 py-10" aria-busy aria-live="polite">
      <div className="h-8 w-40 rounded bg-black/[0.06] dark:bg-white/[0.1]" />
      <div className="h-10 w-3/4 max-w-xl rounded bg-black/[0.06] dark:bg-white/[0.1]" />
      <div className="h-5 w-1/2 max-w-md rounded bg-black/[0.04] dark:bg-white/[0.06]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 rounded-3xl bg-black/[0.04] dark:bg-white/[0.06]" />
        ))}
      </div>
    </div>
  )
}
