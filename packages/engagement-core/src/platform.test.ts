import { describe, expect, test } from "bun:test"

import {
  PlatformClient,
  PlatformConfigError,
  isCapacityRejection,
  resolvePlatformConfig,
  type PlatformTransport,
} from "./platform"

function transportReturning(status: number, text: string, seen?: Array<{ url: string; method: string }>): PlatformTransport {
  return async (input) => {
    seen?.push({ url: input.url, method: input.method })
    return { status, text }
  }
}

const CONFIG = { baseUrl: "https://platform.test", token: "tkn", timeoutMs: 1000 }

describe("platform config", () => {
  test("#given env values #when resolved #then they are used", () => {
    const config = resolvePlatformConfig({
      env: { BENCHMARK_BASE_URL: "https://env.test", BENCHMARK_TOKEN: "env-token" },
    })

    expect(config.baseUrl).toBe("https://env.test")
    expect(config.token).toBe("env-token")
  })

  test("#given env and file #when resolved #then env wins", () => {
    const config = resolvePlatformConfig({
      env: { BENCHMARK_BASE_URL: "https://env.test" },
      file: { baseUrl: "https://file.test", token: "file-token" },
    })

    expect(config.baseUrl).toBe("https://env.test")
    expect(config.token).toBe("file-token")
  })

  test("#given a file token written as ENV:NAME #when resolved #then the variable is used", () => {
    const config = resolvePlatformConfig({
      env: { BENCHMARK_BASE_URL: "https://env.test", MY_SECRET: "from-env" },
      file: { token: "ENV:MY_SECRET" },
    })

    expect(config.token).toBe("from-env")
  })

  test("#given an ENV: token whose variable is unset #when resolved #then it is refused rather than sent blank", () => {
    expect(() =>
      resolvePlatformConfig({
        env: { BENCHMARK_BASE_URL: "https://env.test" },
        file: { token: "ENV:MISSING" },
      }),
    ).toThrow(/token is not configured/)
  })

  test("#given no base url #when resolved #then it is refused", () => {
    expect(() => resolvePlatformConfig({ env: { BENCHMARK_TOKEN: "t" } })).toThrow(PlatformConfigError)
  })

  test("#given a trailing slash #when resolved #then it is trimmed so paths do not double up", () => {
    const config = resolvePlatformConfig({
      env: { BENCHMARK_BASE_URL: "https://env.test///", BENCHMARK_TOKEN: "t" },
    })

    expect(config.baseUrl).toBe("https://env.test")
  })

  test("#given a non-positive timeout #when resolved #then it is refused", () => {
    expect(() =>
      resolvePlatformConfig({
        env: { BENCHMARK_BASE_URL: "https://e.test", BENCHMARK_TOKEN: "t" },
        file: { timeoutMs: 0 },
      }),
    ).toThrow(/timeout must be a positive number/)
  })
})

describe("platform client", () => {
  test("#given a 200 with json #when listing challenges #then the parsed value is returned", async () => {
    const client = new PlatformClient(CONFIG, transportReturning(200, JSON.stringify([{ uniqueCode: "c1", title: "one" }])))
    const result = await client.listChallenges()

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok")
    expect(result.value[0]?.uniqueCode).toBe("c1")
  })

  test("#given a 409 #when starting a challenge #then it is a rejection result, never a thrown error", async () => {
    const client = new PlatformClient(
      CONFIG,
      transportReturning(409, JSON.stringify({ code: "max_active", detail: "max active reached" })),
    )

    const result = await client.startChallenge("c1")
    expect(result.kind).toBe("rejected")
    if (result.kind !== "rejected") throw new Error("expected rejected")
    expect(result.error.status).toBe(409)
    expect(result.error.code).toBe("max_active")
  })

  test("#given a 500 #when calling #then it is reported unavailable rather than rejected", async () => {
    const client = new PlatformClient(CONFIG, transportReturning(500, "boom"))
    const result = await client.listChallenges()

    expect(result.kind).toBe("unavailable")
  })

  test("#given a transport that throws #when calling #then it is unavailable with the transport reason", async () => {
    const client = new PlatformClient(CONFIG, async () => {
      throw new Error("connection refused")
    })

    const result = await client.listChallenges()
    expect(result.kind).toBe("unavailable")
    if (result.kind !== "unavailable") throw new Error("expected unavailable")
    expect(result.error.code).toBe("transport_failure")
    expect(result.error.detail).toContain("connection refused")
  })

  test("#given a non-json error body #when calling #then the raw text becomes the detail", async () => {
    const client = new PlatformClient(CONFIG, transportReturning(400, "bad request: no such challenge"))
    const result = await client.startChallenge("c9")

    expect(result.kind).toBe("rejected")
    if (result.kind !== "rejected") throw new Error("expected rejected")
    expect(result.error.detail).toContain("no such challenge")
  })

  test("#given a body-less 204 #when calling #then it is ok with a null value rather than a parse error", async () => {
    const client = new PlatformClient(CONFIG, transportReturning(204, ""))
    const result = await client.closeChallenge("c1")

    expect(result.kind).toBe("ok")
  })

  test("#given submit #when called #then the documented path and verb are used", async () => {
    const seen: Array<{ url: string; method: string }> = []
    const client = new PlatformClient(CONFIG, transportReturning(200, "{}", seen))

    await client.submitFlag("c1", "flag{x}")
    expect(seen[0]?.method).toBe("POST")
    expect(seen[0]?.url).toContain("/challenges/submit")
  })

  test("#given a unique code with special characters #when used in a query #then it is url-encoded", async () => {
    const seen: Array<{ url: string; method: string }> = []
    const client = new PlatformClient(CONFIG, transportReturning(200, "{}", seen))

    await client.startChallenge("a b&c")
    expect(seen[0]?.url).toContain("unique_code=a%20b%26c")
  })
})

describe("capacity classification", () => {
  test("#given a 409 rejection #when classified #then it counts as capacity", () => {
    expect(
      isCapacityRejection({ kind: "rejected", error: { code: "max_active", status: 409, detail: null } }),
    ).toBe(true)
  })

  test("#given a detail mentioning capacity #when classified #then it counts as capacity", () => {
    expect(
      isCapacityRejection({
        kind: "rejected",
        error: { code: "conflict", status: 400, detail: "capacity exhausted" },
      }),
    ).toBe(true)
  })

  test("#given an unrelated rejection #when classified #then it is not capacity", () => {
    expect(
      isCapacityRejection({ kind: "rejected", error: { code: "bad_flag", status: 400, detail: "wrong flag" } }),
    ).toBe(false)
  })

  test("#given an ok result #when classified #then it is not capacity", () => {
    expect(isCapacityRejection({ kind: "ok", value: null, status: 200 })).toBe(false)
  })
})
