import 'server-only'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { createMemoryRateLimiter, type RateLimiter } from '@/core/security/rate-limit'
import { getServerEnv } from '@/lib/env'

let limiter: RateLimiter | null = null
const upstashByWindow = new Map<string, Ratelimit>()

function createUpstashLimiter(url: string, token: string): RateLimiter {
  const redis = new Redis({ url, token })
  return {
    async limit(key, max, windowMs) {
      const windowKey = `${max}:${windowMs}`
      let rl = upstashByWindow.get(windowKey)
      if (!rl) {
        rl = new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(max, `${Math.max(1, Math.floor(windowMs / 1000))} s`),
          prefix: 'flowear:rl',
        })
        upstashByWindow.set(windowKey, rl)
      }
      const r = await rl.limit(key)
      return { allowed: r.success, remaining: r.remaining, resetAt: new Date(r.reset) }
    },
  }
}

/** Upstash quand il est configuré (obligatoire en production), mémoire sinon. */
export function getRateLimiter(): RateLimiter {
  if (limiter) return limiter
  const env = getServerEnv()
  limiter =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? createUpstashLimiter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN)
      : createMemoryRateLimiter()
  return limiter
}
