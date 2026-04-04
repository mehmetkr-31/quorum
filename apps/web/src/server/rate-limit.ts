/**
 * In-memory rate limiter with per-IP and per-wallet support.
 * Production'da Redis ile değiştirilmeli.
 */

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
  windowMs: number
  max: number
}

/** Default: 60 requests per minute per IP */
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  max: 60,
}

/**
 * Per-endpoint rate limit profiles.
 * Write operations (submit, vote, create) have stricter limits.
 */
export const RATE_LIMIT_PROFILES = {
  /** Read-only endpoints */
  read: { windowMs: 60_000, max: 120 },
  /** Write endpoints (contribution submit, vote cast) */
  write: { windowMs: 60_000, max: 20 },
  /** DAO/dataset creation — expensive, very strict */
  create: { windowMs: 60_000, max: 5 },
  /** Revenue distribution — server-signed, very strict */
  revenue: { windowMs: 60_000, max: 10 },
  /** HuggingFace push — external API call, very strict */
  push: { windowMs: 300_000, max: 3 }, // 3 per 5 minutes
} as const

export type RateLimitProfile = keyof typeof RATE_LIMIT_PROFILES

function checkKey(key: string, config: RateLimitConfig): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return true
  }

  if (entry.count >= config.max) return false

  entry.count++
  return true
}

/**
 * Check rate limit by IP address.
 */
export function checkRateLimit(ip: string, config: RateLimitConfig = DEFAULT_CONFIG): boolean {
  return checkKey(`ip:${ip}`, config)
}

/**
 * Check rate limit by wallet address + endpoint profile.
 * This prevents a single wallet from spamming write operations
 * even if they rotate IP addresses.
 */
export function checkWalletRateLimit(
  walletAddress: string,
  profile: RateLimitProfile = "write",
): boolean {
  const config = RATE_LIMIT_PROFILES[profile]
  return checkKey(`wallet:${profile}:${walletAddress.toLowerCase()}`, config)
}

/**
 * Combined check: must pass both IP limit and wallet limit.
 * Returns the reason for failure or null if allowed.
 */
export function checkCombinedRateLimit(
  ip: string,
  walletAddress: string | null,
  profile: RateLimitProfile = "write",
): { allowed: boolean; reason?: string } {
  const ipConfig = RATE_LIMIT_PROFILES[profile]

  if (!checkKey(`ip:${profile}:${ip}`, ipConfig)) {
    return { allowed: false, reason: "Rate limit exceeded (IP)" }
  }

  if (walletAddress && !checkWalletRateLimit(walletAddress, profile)) {
    return { allowed: false, reason: "Rate limit exceeded (wallet)" }
  }

  return { allowed: true }
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  )
}

/**
 * Get remaining requests for a key (for X-RateLimit-Remaining header).
 */
export function getRemainingRequests(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
): number {
  const entry = store.get(key)
  if (!entry || Date.now() > entry.resetAt) return config.max
  return Math.max(0, config.max - entry.count)
}
