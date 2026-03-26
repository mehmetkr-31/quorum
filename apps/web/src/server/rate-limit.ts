// Basit in-memory rate limiter
// Production'da Redis ile değiştirilmeli

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Her 5 dakikada bir eski kayıtları temizle
setInterval(
  () => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
  },
  5 * 60 * 1000,
)

export interface RateLimitConfig {
  windowMs: number // zaman penceresi (ms)
  max: number // pencere başına maksimum istek
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000, // 1 dakika
  max: 60, // dakikada 60 istek
}

export function checkRateLimit(ip: string, config: RateLimitConfig = DEFAULT_CONFIG): boolean {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + config.windowMs })
    return true
  }

  if (entry.count >= config.max) return false

  entry.count++
  return true
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  )
}
