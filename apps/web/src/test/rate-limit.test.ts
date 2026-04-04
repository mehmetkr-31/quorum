import { describe, expect, it } from "vitest"
import {
  checkCombinedRateLimit,
  checkRateLimit,
  checkWalletRateLimit,
  getClientIp,
  RATE_LIMIT_PROFILES,
} from "@/server/rate-limit"

let ipCounter = 0
let walletCounter = 0
function uniqueIp() {
  return `192.168.${Math.floor(++ipCounter / 256)}.${ipCounter % 256}`
}
function uniqueWallet() {
  const hex = (++walletCounter).toString(16).padStart(64, "0")
  return `0x${hex}`
}

describe("checkRateLimit (IP-based)", () => {
  it("ilk istekte true döner", () => {
    expect(checkRateLimit(uniqueIp())).toBe(true)
  })

  it("limit altındaki isteklere izin verir", () => {
    const ip = uniqueIp()
    const config = { windowMs: 60_000, max: 5 }
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(ip, config)).toBe(true)
    }
  })

  it("limite ulaşınca false döner", () => {
    const ip = uniqueIp()
    const config = { windowMs: 60_000, max: 3 }
    checkRateLimit(ip, config)
    checkRateLimit(ip, config)
    checkRateLimit(ip, config)
    expect(checkRateLimit(ip, config)).toBe(false)
  })

  it("pencere sıfırlanınca tekrar izin verir", () => {
    const ip = uniqueIp()
    const config = { windowMs: 100, max: 1 }
    checkRateLimit(ip, config)
    expect(checkRateLimit(ip, config)).toBe(false)

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(checkRateLimit(ip, config)).toBe(true)
        resolve()
      }, 150)
    })
  })

  it("farklı IP'ler birbirini etkilemez", () => {
    const config = { windowMs: 60_000, max: 1 }
    const ip1 = uniqueIp()
    const ip2 = uniqueIp()
    checkRateLimit(ip1, config)
    expect(checkRateLimit(ip1, config)).toBe(false)
    expect(checkRateLimit(ip2, config)).toBe(true)
  })
})

describe("checkWalletRateLimit (per-wallet)", () => {
  it("write profile: 20 istekte limit aşılır", () => {
    const wallet = uniqueWallet()
    const limit = RATE_LIMIT_PROFILES.write.max
    for (let i = 0; i < limit; i++) {
      expect(checkWalletRateLimit(wallet, "write")).toBe(true)
    }
    expect(checkWalletRateLimit(wallet, "write")).toBe(false)
  })

  it("create profile: 5 istekte limit aşılır", () => {
    const wallet = uniqueWallet()
    const limit = RATE_LIMIT_PROFILES.create.max
    for (let i = 0; i < limit; i++) {
      expect(checkWalletRateLimit(wallet, "create")).toBe(true)
    }
    expect(checkWalletRateLimit(wallet, "create")).toBe(false)
  })

  it("push profile: farklı cüzdanlar bağımsız sayar", () => {
    const w1 = uniqueWallet()
    const w2 = uniqueWallet()
    const limit = RATE_LIMIT_PROFILES.push.max
    for (let i = 0; i < limit; i++) {
      checkWalletRateLimit(w1, "push")
    }
    expect(checkWalletRateLimit(w1, "push")).toBe(false)
    expect(checkWalletRateLimit(w2, "push")).toBe(true)
  })

  it("farklı profiller aynı cüzdan için bağımsız sayar", () => {
    const wallet = uniqueWallet()
    // write limitini doldur
    for (let i = 0; i < RATE_LIMIT_PROFILES.write.max; i++) {
      checkWalletRateLimit(wallet, "write")
    }
    expect(checkWalletRateLimit(wallet, "write")).toBe(false)
    // read profili etkilenmemiş olmalı
    expect(checkWalletRateLimit(wallet, "read")).toBe(true)
  })
})

describe("checkCombinedRateLimit", () => {
  it("hem IP hem wallet geçerliyse allowed=true döner", () => {
    const result = checkCombinedRateLimit(uniqueIp(), uniqueWallet(), "write")
    expect(result.allowed).toBe(true)
  })

  it("wallet limiti doluysa allowed=false döner", () => {
    const ip = uniqueIp()
    const wallet = uniqueWallet()
    // Wallet limitini doldur
    for (let i = 0; i < RATE_LIMIT_PROFILES.write.max; i++) {
      checkCombinedRateLimit(ip, wallet, "write")
    }
    const result = checkCombinedRateLimit(uniqueIp(), wallet, "write")
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/wallet/i)
  })

  it("wallet null ise sadece IP kontrol edilir", () => {
    const result = checkCombinedRateLimit(uniqueIp(), null, "write")
    expect(result.allowed).toBe(true)
  })
})

describe("getClientIp", () => {
  it("x-forwarded-for başlığından IP alır", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    })
    expect(getClientIp(req)).toBe("1.2.3.4")
  })

  it("x-real-ip başlığını kullanır", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-real-ip": "9.10.11.12" },
    })
    expect(getClientIp(req)).toBe("9.10.11.12")
  })

  it("başlık yoksa 'unknown' döner", () => {
    const req = new Request("http://localhost/")
    expect(getClientIp(req)).toBe("unknown")
  })

  it("x-forwarded-for virgülle ayrılmış listede ilk IP'yi alır", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "  203.0.113.1  , 10.0.0.1" },
    })
    expect(getClientIp(req)).toBe("203.0.113.1")
  })
})
