/**
 * Limiteur de débit : Upstash en production, mémoire en développement et en test.
 * L'implémentation est choisie une fois par processus (voir `src/lib/api/rate-limit.ts`).
 */
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

export interface RateLimiter {
  limit(key: string, max: number, windowMs: number): Promise<RateLimitResult>
}

export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return {
    async limit(key, max, windowMs) {
      const t = now()
      const entry = hits.get(key)
      if (!entry || t >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: t + windowMs })
        return { allowed: true, remaining: max - 1, resetAt: new Date(t + windowMs) }
      }
      if (entry.count >= max) return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) }
      entry.count += 1
      return { allowed: true, remaining: max - entry.count, resetAt: new Date(entry.resetAt) }
    },
  }
}
