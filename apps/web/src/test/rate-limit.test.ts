import { describe, expect, it } from "vitest"
import { checkRateLimit, getClientIp } from "@/server/rate-limit"

// rate-limit module'ünü yeniden yüklemek için store'u sıfırla
// Her testte bağımsız bir IP kullanıyoruz
let ipCounter = 0
function uniqueIp() {
  return `192.168.1.${++ipCounter}`
}

describe("checkRateLimit", () => {
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
