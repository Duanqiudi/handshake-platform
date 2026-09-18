import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ApplicationError, type FeasibilityGatewayService } from "@handshake/application";
import type { HandshakeBudgetLimits } from "@handshake/domain";

const DEFAULT_BODY_LIMIT_BYTES = 64 * 1024;
const DEVELOPMENT_COMMUNITY_HEADER = "x-handshake-dev-community-id";
const DEFAULT_BUDGET: HandshakeBudgetLimits = {
  maxRounds: 6,
  maxQuestionsPerRound: 3,
  maxTokens: 6_000,
  maxCostMicros: 1_000_000,
};

export interface GatewayHttpServerOptions {
  readonly service: FeasibilityGatewayService;
  readonly healthCheck?: () => Promise<void>;
  readonly bodyLimitBytes?: number;
}

class HttpRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

export function createGatewayHttpServer(options: GatewayHttpServerOptions): Server {
  return createServer((request, response) => {
    handleRequest(request, response, options).catch((error: unknown) => {
      writeError(response, error);
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: GatewayHttpServerOptions,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://gateway.local");
  const segments = parseSegments(url.pathname);

  if (method === "GET" && segments.length === 1 && segments[0] === "healthz") {
    await options.healthCheck?.();
    writeJson(response, 200, { status: "ok" });
    return;
  }

  if (segments[0] !== "v1" || segments[1] !== "communities" || segments[3] !== "handshakes") {
    throw new HttpRequestError(404, "ROUTE_NOT_FOUND", "Route not found.");
  }
  const communityId = requiredSegment(segments[2], "communityId");
  const callerCommunityId = request.headers[DEVELOPMENT_COMMUNITY_HEADER];
  if (typeof callerCommunityId !== "string" || callerCommunityId !== communityId) {
    throw new HttpRequestError(
      404,
      "COMMUNITY_CONTEXT_MISMATCH",
      "Route is unavailable in the current development community context.",
    );
  }

  if (method === "POST" && segments.length === 4) {
    requireJson(request);
    const body = asCreateBody(
      await readJsonBody(request, options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES),
    );
    const handshake = await options.service.createScreeningHandshake({
      id: body.handshake_id,
      communityId,
      scene: body.scene,
      purpose: body.purpose,
      participantIds: body.participant_endpoint_ids,
      budgetLimits: body.budget_limits ?? DEFAULT_BUDGET,
    });
    writeJson(response, 201, { data: { handshake } });
    return;
  }

  const handshakeId = requiredSegment(segments[4], "handshakeId");
  if (method === "GET" && segments.length === 5) {
    const handshake = await options.service.getHandshake({ communityId, handshakeId });
    writeJson(response, 200, { data: { handshake } });
    return;
  }

  if (method === "POST" && segments.length === 6 && segments[5] === "messages") {
    requireJson(request);
    const dto = await readJsonBody(request, options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES);
    const result = await options.service.receiveMessage({ communityId, handshakeId, dto });
    writeJson(response, 200, {
      data: {
        handshake: result.handshake,
        accepted_message_id: result.message.message_id,
        command: result.command.type,
      },
    });
    return;
  }

  throw new HttpRequestError(404, "ROUTE_NOT_FOUND", "Route not found.");
}

function parseSegments(pathname: string): string[] {
  try {
    return pathname
      .split("/")
      .filter((segment) => segment.length > 0)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    throw new HttpRequestError(400, "INVALID_PATH", "Path contains invalid encoding.");
  }
}

function requiredSegment(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new HttpRequestError(400, "INVALID_PATH", `Missing ${name} path segment.`);
  }
  return value;
}

function requireJson(request: IncomingMessage): void {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpRequestError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json.",
    );
  }
}

async function readJsonBody(request: IncomingMessage, limitBytes: number): Promise<unknown> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    throw new HttpRequestError(413, "BODY_TOO_LARGE", "Request body exceeds the configured limit.");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > limitBytes) {
      tooLarge = true;
    } else {
      chunks.push(buffer);
    }
  }
  if (tooLarge) {
    throw new HttpRequestError(413, "BODY_TOO_LARGE", "Request body exceeds the configured limit.");
  }
  if (totalBytes === 0) {
    throw new HttpRequestError(400, "INVALID_JSON", "A JSON request body is required.");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpRequestError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }
}

interface CreateBody {
  readonly handshake_id: string;
  readonly scene: string;
  readonly purpose: string;
  readonly participant_endpoint_ids: readonly [string, string];
  readonly budget_limits?: HandshakeBudgetLimits;
}

function asCreateBody(value: unknown): CreateBody {
  if (!isRecord(value)) {
    throw invalidCreateBody();
  }
  const participants = value.participant_endpoint_ids;
  if (
    typeof value.handshake_id !== "string" ||
    typeof value.scene !== "string" ||
    typeof value.purpose !== "string" ||
    !Array.isArray(participants) ||
    participants.length !== 2 ||
    typeof participants[0] !== "string" ||
    typeof participants[1] !== "string"
  ) {
    throw invalidCreateBody();
  }
  const budget = value.budget_limits;
  if (budget !== undefined && !isBudget(budget)) {
    throw invalidCreateBody();
  }
  return {
    handshake_id: value.handshake_id,
    scene: value.scene,
    purpose: value.purpose,
    participant_endpoint_ids: [participants[0], participants[1]],
    ...(budget === undefined ? {} : { budget_limits: budget }),
  };
}

function invalidCreateBody(): HttpRequestError {
  return new HttpRequestError(
    400,
    "INVALID_CREATE_REQUEST",
    "Create body requires handshake_id, scene, purpose and two participant_endpoint_ids.",
  );
}

function isBudget(value: unknown): value is HandshakeBudgetLimits {
  if (!isRecord(value)) return false;
  return ["maxRounds", "maxQuestionsPerRound", "maxTokens", "maxCostMicros"].every((key) => {
    const amount = value[key];
    return typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  if (error instanceof HttpRequestError) {
    writeJson(response, error.status, {
      error: { code: error.code, message: error.message, retryable: false },
    });
    return;
  }
  if (error instanceof ApplicationError) {
    writeJson(response, statusForApplicationError(error.code), { error: error.toJSON() });
    return;
  }
  writeJson(response, 500, {
    error: { code: "INTERNAL_ERROR", message: "Unexpected Gateway error.", retryable: true },
  });
}

function statusForApplicationError(code: string): number {
  switch (code) {
    case "HANDSHAKE_NOT_FOUND":
    case "ROUTE_MISMATCH":
    case "COMMUNITY_SCOPE_VIOLATION":
    case "PARTICIPANT_SCOPE_VIOLATION":
      return 404;
    case "HANDSHAKE_ALREADY_EXISTS":
    case "REPLAY_DETECTED":
    case "CONCURRENT_MODIFICATION":
      return 409;
    case "MESSAGE_EXPIRED":
      return 410;
    case "UNSUPPORTED_MESSAGE_TYPE":
    case "DOMAIN_COMMAND_REJECTED":
    case "INVALID_STATE":
      return 422;
    default:
      return 400;
  }
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}
