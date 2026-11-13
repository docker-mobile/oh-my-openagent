/**
 * Typed HTTP platform client. Every response is a result carrying its status and
 * error code, so a rejection the platform reports (for example "max active") is
 * a value a caller can act on rather than an exception that unwinds an
 * unattended loop.
 *
 * Absorbed from sapper-v2 (MIT, pin 7b75e6f1f5) `lib/arena.py` (`ArenaClient`,
 * `_request`, `list_challenges`, `start_challenge`, `get_hint`, `submit_flag`,
 * `close_challenge`) and its config resolution. The upstream adds a subclass to
 * hide a 409 from callers; here the rejection is a typed result instead. See
 * NOTICE.
 */

export class PlatformConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PlatformConfigError"
  }
}

export interface PlatformConfig {
  readonly baseUrl: string
  readonly token: string
  readonly timeoutMs: number
}

export interface PlatformConfigSources {
  readonly env?: Record<string, string | undefined>
  readonly file?: { readonly baseUrl?: string; readonly token?: string; readonly timeoutMs?: number } | null
  readonly defaultTimeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000
const ENV_INDIRECTION_PREFIX = "ENV:"

/**
 * Resolves config with environment first, then the project file. A file value
 * written as `ENV:VAR` defers to that variable, so a token never has to be
 * stored in the file itself.
 */
export function resolvePlatformConfig(sources: PlatformConfigSources = {}): PlatformConfig {
  const env = sources.env ?? {}
  const file = sources.file ?? null

  const fileToken = file?.token
  const resolvedFileToken =
    typeof fileToken === "string" && fileToken.startsWith(ENV_INDIRECTION_PREFIX)
      ? env[fileToken.slice(ENV_INDIRECTION_PREFIX.length)]
      : fileToken

  const baseUrl = env["BENCHMARK_BASE_URL"] ?? file?.baseUrl
  const token = env["BENCHMARK_TOKEN"] ?? resolvedFileToken
  const timeoutMs = file?.timeoutMs ?? sources.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS

  if (!baseUrl) throw new PlatformConfigError("platform base url is not configured (BENCHMARK_BASE_URL or arena.json)")
  if (!token) throw new PlatformConfigError("platform token is not configured (BENCHMARK_TOKEN or arena.json)")
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new PlatformConfigError(`timeout must be a positive number, got ${JSON.stringify(timeoutMs)}`)
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), token, timeoutMs }
}

export interface PlatformError {
  readonly code: string
  readonly status: number
  readonly detail: string | null
}

export type PlatformResult<T> =
  | { readonly kind: "ok"; readonly value: T; readonly status: number }
  | { readonly kind: "rejected"; readonly error: PlatformError }
  | { readonly kind: "unavailable"; readonly error: PlatformError }

export interface PlatformChallenge {
  readonly uniqueCode: string
  readonly title: string
}

export type PlatformTransport = (input: {
  readonly url: string
  readonly method: "GET" | "POST"
  readonly token: string
  readonly timeoutMs: number
  readonly body?: unknown
}) => Promise<{ readonly status: number; readonly text: string }>

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** A 4xx is a rejection the platform decided; anything else is treated as unavailability. */
function classify(status: number, payload: unknown, raw: string): PlatformError {
  const record = asRecord(payload)
  const code = typeof record?.["code"] === "string" ? (record["code"] as string) : `http_${status}`
  const detail =
    typeof record?.["detail"] === "string"
      ? (record["detail"] as string)
      : typeof record?.["message"] === "string"
        ? (record["message"] as string)
        : raw.trim() || null

  return { code, status, detail }
}

export class PlatformClient {
  private readonly config: PlatformConfig
  private readonly transport: PlatformTransport

  constructor(config: PlatformConfig, transport: PlatformTransport) {
    this.config = config
    this.transport = transport
  }

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<PlatformResult<T>> {
    let response: { status: number; text: string }
    try {
      response = await this.transport({
        url: `${this.config.baseUrl}${path}`,
        method,
        token: this.config.token,
        timeoutMs: this.config.timeoutMs,
        body,
      })
    } catch (error) {
      return {
        kind: "unavailable",
        error: {
          code: "transport_failure",
          status: 0,
          detail: error instanceof Error ? error.message : String(error),
        },
      }
    }

    let payload: unknown = null
    if (response.text.trim() !== "") {
      try {
        payload = JSON.parse(response.text)
      } catch {
        payload = null
      }
    }

    if (response.status >= 200 && response.status < 300) {
      return { kind: "ok", value: payload as T, status: response.status }
    }

    const error = classify(response.status, payload, response.text)
    return response.status >= 400 && response.status < 500
      ? { kind: "rejected", error }
      : { kind: "unavailable", error }
  }

  listChallenges(): Promise<PlatformResult<readonly PlatformChallenge[]>> {
    return this.call<readonly PlatformChallenge[]>("GET", "/openapi/v1/challenges")
  }

  startChallenge(uniqueCode: string): Promise<PlatformResult<unknown>> {
    return this.call("POST", `/challenges/start?unique_code=${encodeURIComponent(uniqueCode)}`)
  }

  getHint(uniqueCode: string): Promise<PlatformResult<unknown>> {
    return this.call("GET", `/challenges/hint?unique_code=${encodeURIComponent(uniqueCode)}`)
  }

  submitFlag(uniqueCode: string, flag: string): Promise<PlatformResult<unknown>> {
    return this.call("POST", "/challenges/submit", { unique_code: uniqueCode, flag })
  }

  closeChallenge(uniqueCode: string): Promise<PlatformResult<unknown>> {
    return this.call("POST", `/challenges/close?unique_code=${encodeURIComponent(uniqueCode)}`)
  }
}

/**
 * True when a result means "the platform is at capacity", which is the case an
 * unattended run must retry rather than treat as a hard failure.
 */
export function isCapacityRejection(result: PlatformResult<unknown>): boolean {
  if (result.kind !== "rejected") return false
  const haystack = `${result.error.code} ${result.error.detail ?? ""}`.toLowerCase()
  return result.error.status === 409 || haystack.includes("max active") || haystack.includes("capacity")
}
