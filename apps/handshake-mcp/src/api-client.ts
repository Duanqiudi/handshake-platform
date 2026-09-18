export type JsonObject = Record<string, unknown>;

export interface HandshakeApiClientOptions {
  readonly baseUrl: string;
  readonly ownerToken: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export interface MemberApiClient {
  get(path: string): Promise<unknown>;
  post(path: string, body?: JsonObject): Promise<unknown>;
}

interface ApiErrorBody {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly retryable?: unknown;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ERROR_MESSAGE_LENGTH = 500;

export class HandshakeApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "HandshakeApiError";
  }
}

export class HandshakeApiClient implements MemberApiClient {
  readonly #baseUrl: URL;
  readonly #ownerToken: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof globalThis.fetch;

  public constructor(options: HandshakeApiClientOptions) {
    this.#baseUrl = parseBaseUrl(options.baseUrl);
    this.#ownerToken = requireSecret(options.ownerToken, "HANDSHAKE_OWNER_TOKEN");
    this.#timeoutMs = parseTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  public get(path: string): Promise<unknown> {
    return this.#request("GET", path);
  }

  public post(path: string, body?: JsonObject): Promise<unknown> {
    return this.#request("POST", path, body);
  }

  async #request(method: "GET" | "POST", path: string, body?: JsonObject): Promise<unknown> {
    const url = memberApiUrl(this.#baseUrl, path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(url, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.#ownerToken}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      const parsed = await parseResponseBody(response);
      if (!response.ok) {
        throw asApiError(response.status, parsed);
      }
      return unwrapData(parsed);
    } catch (error: unknown) {
      if (error instanceof HandshakeApiError) throw error;
      if (isAbortError(error)) {
        throw new HandshakeApiError(
          0,
          "UPSTREAM_TIMEOUT",
          "Handshake API request timed out.",
          true,
        );
      }
      throw new HandshakeApiError(0, "UPSTREAM_UNAVAILABLE", "Handshake API is unavailable.", true);
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("HANDSHAKE_API_BASE_URL must be an absolute HTTP(S) URL.");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("HANDSHAKE_API_BASE_URL must be an HTTP(S) URL without embedded credentials.");
  }
  if (url.search || url.hash) {
    throw new Error("HANDSHAKE_API_BASE_URL must not contain a query string or fragment.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

function requireSecret(value: string, name: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${name} is required.`);
  if (/\s/.test(trimmed)) throw new Error(`${name} must not contain whitespace.`);
  return trimmed;
}

function parseTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > 120_000) {
    throw new Error("API timeout must be an integer between 100 and 120000 milliseconds.");
  }
  return value;
}

function memberApiUrl(baseUrl: URL, path: string): URL {
  if (!path.startsWith("/v1/")) {
    throw new Error("Member API paths must start with /v1/.");
  }
  const relative = path.slice(1);
  return new URL(relative, baseUrl);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new HandshakeApiError(
        response.status,
        "INVALID_UPSTREAM_RESPONSE",
        "Handshake API returned invalid JSON.",
        true,
      );
    }
    return null;
  }
}

function asApiError(status: number, body: unknown): HandshakeApiError {
  const candidate = isRecord(body) && isRecord(body.error) ? body.error : body;
  const errorBody: ApiErrorBody = isRecord(candidate) ? candidate : {};
  const code =
    typeof errorBody.code === "string" && /^[A-Z0-9_]{1,80}$/.test(errorBody.code)
      ? errorBody.code
      : `HTTP_${status}`;
  const message =
    typeof errorBody.message === "string" && errorBody.message.trim().length > 0
      ? errorBody.message.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH)
      : `Handshake API request failed with HTTP ${status}.`;
  return new HandshakeApiError(
    status,
    code,
    message,
    errorBody.retryable === true || status >= 500,
  );
}

function unwrapData(body: unknown): unknown {
  return isRecord(body) && Object.hasOwn(body, "data") ? body.data : body;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
