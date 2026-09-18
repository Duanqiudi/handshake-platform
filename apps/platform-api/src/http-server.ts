import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import {
  type AddArtifactInput,
  type AddCheckInInput,
  type AddFeedbackInput,
  type AnswerQuestionInput,
  type AskQuestionInput,
  type CreateConnectionInput,
  type CreateIntentInput,
  type DemoBootstrapResult,
  type ImportCapsuleInput,
  type OnboardOwnerInput,
  type ProductApplicationService,
  ProductError,
  type StartHandshakeInput,
  type SubmitDecisionInput,
  type SubmitRecommendationInput,
  type UpdateCapsuleInput,
  type UpdateConnectionInput,
} from "@handshake/product-application";

const DEFAULT_BODY_LIMIT_BYTES = 64 * 1024;

export interface PlatformHttpServerOptions {
  readonly service: ProductApplicationService;
  readonly healthCheck?: () => Promise<void>;
  readonly bodyLimitBytes?: number;
  readonly demoMode?: boolean;
  readonly onboardingInviteCode?: string;
  readonly corsAllowedOrigins?: readonly string[];
  readonly staticDirectory?: string;
}

class HttpRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

export function createPlatformHttpServer(options: PlatformHttpServerOptions): Server {
  return createServer((request, response) => {
    handleRequest(request, response, options).catch((error: unknown) => {
      writeError(response, error);
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: PlatformHttpServerOptions,
): Promise<void> {
  applySecurityHeaders(response);
  applyCors(request, response, options.corsAllowedOrigins ?? []);
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
      "access-control-allow-headers": "Authorization, Content-Type, Accept",
      "access-control-max-age": "600",
    });
    response.end();
    return;
  }

  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://platform.local");
  const segments = parseSegments(url.pathname);

  if (method === "GET" && segments.length === 1 && segments[0] === "healthz") {
    await options.healthCheck?.();
    writeData(response, 200, { status: "ok" });
    return;
  }

  if (segments[0] !== "v1") {
    if (
      (method === "GET" || method === "HEAD") &&
      options.staticDirectory !== undefined &&
      serveStatic(request, response, options.staticDirectory, url.pathname)
    ) {
      return;
    }
    throw new HttpRequestError(404, "ROUTE_NOT_FOUND", "Route not found.");
  }

  if (method === "POST" && matches(segments, "v1", "onboarding")) {
    const body = await readBodyObject(request, options.bodyLimitBytes);
    verifyInviteCode(body.inviteCode, options.onboardingInviteCode);
    const input = asOnboardingInput(body);
    writeData(response, 201, await options.service.onboard(input));
    return;
  }

  if (method === "POST" && matches(segments, "v1", "demo", "reset")) {
    if (options.demoMode !== true) {
      throw new HttpRequestError(404, "ROUTE_NOT_FOUND", "Route not found.");
    }
    writeData(response, 200, redactDemoBootstrap(await options.service.resetDemo()));
    return;
  }

  const owner = await authenticate(request, options.service);

  if (method === "GET" && matches(segments, "v1", "me", "dashboard")) {
    writeData(response, 200, await options.service.getDashboard(owner.id));
    return;
  }

  if (matches(segments, "v1", "me", "connections")) {
    if (method === "GET") {
      writeData(response, 200, await options.service.listConnections(owner.id));
      return;
    }
    if (method === "POST") {
      const input = asConnectionInput(await readBodyObject(request, options.bodyLimitBytes));
      writeData(response, 201, await options.service.createConnection(owner.id, input));
      return;
    }
  }

  if (method === "PATCH" && isResourceRoute(segments, "me", "connections")) {
    const input = asUpdateConnectionInput(await readBodyObject(request, options.bodyLimitBytes));
    writeData(
      response,
      200,
      await options.service.updateConnection(
        owner.id,
        requiredSegment(segments[3], "connectionId"),
        input,
      ),
    );
    return;
  }

  if (method === "GET" && matches(segments, "v1", "me", "capsules")) {
    writeData(response, 200, await options.service.listCapsules(owner.id));
    return;
  }

  if (method === "POST" && matches(segments, "v1", "me", "capsules", "import")) {
    const input = asImportCapsuleInput(await readBodyObject(request, options.bodyLimitBytes));
    writeData(response, 201, await options.service.importCapsule(owner.id, input));
    return;
  }

  if (method === "PATCH" && isResourceRoute(segments, "me", "capsules")) {
    const input = asUpdateCapsuleInput(await readBodyObject(request, options.bodyLimitBytes));
    writeData(
      response,
      200,
      await options.service.updateCapsule(
        owner.id,
        requiredSegment(segments[3], "capsuleId"),
        input,
      ),
    );
    return;
  }

  if (method === "POST" && isResourceAction(segments, "me", "capsules", "publish")) {
    writeData(
      response,
      200,
      await options.service.publishCapsule(owner.id, requiredSegment(segments[3], "capsuleId")),
    );
    return;
  }

  if (method === "POST" && isResourceAction(segments, "me", "capsules", "revoke")) {
    writeData(
      response,
      200,
      await options.service.revokeCapsule(owner.id, requiredSegment(segments[3], "capsuleId")),
    );
    return;
  }

  if (matches(segments, "v1", "me", "intents")) {
    if (method === "GET") {
      writeData(response, 200, await options.service.listIntents(owner.id));
      return;
    }
    if (method === "POST") {
      const input = asCreateIntentInput(await readBodyObject(request, options.bodyLimitBytes));
      writeData(response, 201, await options.service.createIntent(owner.id, input));
      return;
    }
  }

  if (method === "POST" && isResourceAction(segments, "me", "intents", "pause")) {
    writeData(
      response,
      200,
      await options.service.pauseIntent(owner.id, requiredSegment(segments[3], "intentId")),
    );
    return;
  }

  if (method === "GET" && matches(segments, "v1", "discovery", "candidates")) {
    writeData(response, 200, await options.service.listCandidates(owner.id));
    return;
  }

  if (matches(segments, "v1", "handshakes")) {
    if (method === "GET") {
      writeData(response, 200, await options.service.listHandshakes(owner.id));
      return;
    }
    if (method === "POST") {
      const input = asStartHandshakeInput(await readBodyObject(request, options.bodyLimitBytes));
      writeData(response, 201, await options.service.startHandshake(owner.id, input));
      return;
    }
  }

  if (method === "GET" && isResourceAction(segments, "handshakes", undefined, "view")) {
    writeData(
      response,
      200,
      await options.service.getHandshakeView(owner.id, requiredSegment(segments[2], "handshakeId")),
    );
    return;
  }

  if (method === "POST" && isResourceAction(segments, "handshakes", undefined, "questions")) {
    const input = asAskQuestionInput(await readBodyObject(request, options.bodyLimitBytes));
    writeData(
      response,
      200,
      await options.service.askQuestion(
        owner.id,
        requiredSegment(segments[2], "handshakeId"),
        input,
      ),
    );
    return;
  }

  if (
    method === "POST" &&
    segments.length === 6 &&
    segments[0] === "v1" &&
    segments[1] === "handshakes" &&
    segments[3] === "questions" &&
    segments[5] === "answer"
  ) {
    const input = asAnswerQuestionInput(await readBodyObject(request, options.bodyLimitBytes));
    writeData(
      response,
      200,
      await options.service.answerQuestion(
        owner.id,
        requiredSegment(segments[2], "handshakeId"),
        requiredSegment(segments[4], "questionId"),
        input,
      ),
    );
    return;
  }

  if (method === "POST" && isResourceAction(segments, "handshakes", undefined, "recommendations")) {
    const input = asRecommendationInput(await readBodyObject(request, options.bodyLimitBytes));
    writeData(
      response,
      200,
      await options.service.submitRecommendation(
        owner.id,
        requiredSegment(segments[2], "handshakeId"),
        input,
      ),
    );
    return;
  }

  if (method === "POST" && isResourceAction(segments, "handshakes", undefined, "decisions")) {
    const input = asDecisionInput(await readBodyObject(request, options.bodyLimitBytes));
    writeData(
      response,
      200,
      await options.service.submitDecision(
        owner.id,
        requiredSegment(segments[2], "handshakeId"),
        input,
      ),
    );
    return;
  }

  if (method === "GET" && matches(segments, "v1", "projects")) {
    writeData(response, 200, await options.service.listProjects(owner.id));
    return;
  }

  if (method === "GET" && isResourceRoute(segments, "projects")) {
    writeData(
      response,
      200,
      await options.service.getProject(owner.id, requiredSegment(segments[2], "projectId")),
    );
    return;
  }

  if (method === "POST" && isResourceAction(segments, "projects", undefined, "check-ins")) {
    const input = asCheckInInput(await readBodyObject(request, options.bodyLimitBytes));
    writeData(
      response,
      200,
      await options.service.addCheckIn(owner.id, requiredSegment(segments[2], "projectId"), input),
    );
    return;
  }

  if (method === "POST" && isResourceAction(segments, "projects", undefined, "artifacts")) {
    const input = asArtifactInput(await readBodyObject(request, options.bodyLimitBytes));
    writeData(
      response,
      200,
      await options.service.addArtifact(owner.id, requiredSegment(segments[2], "projectId"), input),
    );
    return;
  }

  if (method === "POST" && isResourceAction(segments, "projects", undefined, "feedback")) {
    const input = asFeedbackInput(await readBodyObject(request, options.bodyLimitBytes));
    writeData(
      response,
      200,
      await options.service.addFeedback(owner.id, requiredSegment(segments[2], "projectId"), input),
    );
    return;
  }

  if (method === "GET" && matches(segments, "v1", "privacy", "receipts")) {
    writeData(response, 200, await options.service.listReceipts(owner.id));
    return;
  }

  throw new HttpRequestError(404, "ROUTE_NOT_FOUND", "Route not found.");
}

async function authenticate(
  request: IncomingMessage,
  service: ProductApplicationService,
): Promise<Awaited<ReturnType<ProductApplicationService["authenticate"]>>> {
  const header = request.headers.authorization;
  const match = typeof header === "string" ? /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header) : null;
  if (match?.[1] === undefined) {
    throw new HttpRequestError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Authorization must use a valid Bearer owner token.",
    );
  }
  return service.authenticate(match[1]);
}

function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  configuredOrigins: readonly string[],
): void {
  const origin = request.headers.origin;
  if (origin === undefined) return;
  const host = request.headers.host;
  const sameHost =
    host !== undefined && (origin === `http://${host}` || origin === `https://${host}`);
  const wildcard = configuredOrigins.includes("*");
  if (!sameHost && !wildcard && !configuredOrigins.includes(origin)) {
    throw new HttpRequestError(403, "CORS_ORIGIN_DENIED", "Request origin is not allowed.");
  }
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-origin", wildcard ? "*" : origin);
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader(
    "content-security-policy",
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  );
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
}

function verifyInviteCode(provided: unknown, expected: string | undefined): void {
  if (expected === undefined || expected.length === 0) return;
  const providedText = typeof provided === "string" ? provided : "";
  const left = createHash("sha256").update(providedText).digest();
  const right = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(left, right)) {
    throw new HttpRequestError(403, "INVALID_INVITE_CODE", "Invite code is invalid.");
  }
}

function redactDemoBootstrap(result: DemoBootstrapResult): unknown {
  return {
    communityId: result.communityId,
    owners: result.owners.map(({ owner, token }) => ({
      owner: {
        id: owner.id,
        communityId: owner.communityId,
        displayName: owner.displayName,
        status: owner.status,
        createdAt: owner.createdAt,
      },
      token,
    })),
  };
}

function asOnboardingInput(body: Record<string, unknown>): OnboardOwnerInput {
  const contact = isRecord(body.contact)
    ? body.contact
    : { kind: body.contactChannel, value: body.contactValue };
  return {
    displayName: requiredString(body.displayName, "displayName"),
    contact: {
      kind: enumValue(contact.kind, "contact.kind", ["email", "phone", "wechat"]),
      value: requiredString(contact.value, "contact.value"),
    },
  };
}

function asConnectionInput(body: Record<string, unknown>): CreateConnectionInput {
  const rawMode = requiredString(body.mode, "mode");
  const mode = rawMode === "capsule_import" ? "manual_import" : rawMode;
  return {
    provider: enumValue(body.provider, "provider", [
      "chatgpt",
      "kimi",
      "doubao",
      "other",
      "manual",
      "demo",
    ]),
    mode: enumValue(mode, "mode", ["import", "mcp", "demo", "manual_import"]),
    label: requiredString(body.label, "label"),
  };
}

function asUpdateConnectionInput(body: Record<string, unknown>): UpdateConnectionInput {
  const label = optionalString(body.label, "label");
  return {
    ...(label === undefined ? {} : { label }),
    ...(body.status === undefined
      ? {}
      : { status: enumValue(body.status, "status", ["active", "disconnected"]) }),
  };
}

function asImportCapsuleInput(body: Record<string, unknown>): ImportCapsuleInput {
  const fields = requiredRecord(body.fields, "fields");
  return {
    connectionId: requiredString(body.connectionId, "connectionId"),
    ...(optionalString(body.sourceProvider, "sourceProvider") === undefined
      ? {}
      : { sourceProvider: optionalString(body.sourceProvider, "sourceProvider") }),
    ...(body.sourceMode === undefined
      ? {}
      : {
          sourceMode: enumValue(body.sourceMode, "sourceMode", [
            "import",
            "mcp",
            "demo",
            "manual_import",
          ]),
        }),
    ...(body.purpose === undefined
      ? {}
      : {
          purpose: enumValue(body.purpose, "purpose", ["seven_day_portfolio_teamup"]),
        }),
    fields,
    ...(body.approvedFields === undefined
      ? {}
      : { approvedFields: stringArray(body.approvedFields, "approvedFields") }),
    ...(optionalString(body.expiresAt, "expiresAt") === undefined
      ? {}
      : { expiresAt: optionalString(body.expiresAt, "expiresAt") }),
  } as ImportCapsuleInput;
}

function asUpdateCapsuleInput(body: Record<string, unknown>): UpdateCapsuleInput {
  return {
    ...(body.fields === undefined ? {} : { fields: requiredRecord(body.fields, "fields") }),
    ...(body.approvedFields === undefined
      ? {}
      : { approvedFields: stringArray(body.approvedFields, "approvedFields") }),
    ...(optionalString(body.expiresAt, "expiresAt") === undefined
      ? {}
      : { expiresAt: optionalString(body.expiresAt, "expiresAt") }),
  } as UpdateCapsuleInput;
}

function asCreateIntentInput(body: Record<string, unknown>): CreateIntentInput {
  const startsOn = optionalString(body.startsOn, "startsOn");
  const timezone = optionalString(body.timezone, "timezone");
  return {
    capsuleId: requiredString(body.capsuleId, "capsuleId"),
    title: requiredString(body.title, "title"),
    summary: requiredString(body.summary, "summary"),
    desiredArtifact: requiredString(body.desiredArtifact, "desiredArtifact"),
    ...(startsOn === undefined ? {} : { startsOn }),
    ...(body.weeklyHours === undefined
      ? {}
      : { weeklyHours: requiredNumber(body.weeklyHours, "weeklyHours") }),
    ...(timezone === undefined ? {} : { timezone }),
    ...(body.slots === undefined ? {} : { slots: stringArray(body.slots, "slots") }),
    ...(body.minimumPartnerWeeklyHours === undefined
      ? {}
      : {
          minimumPartnerWeeklyHours: requiredNumber(
            body.minimumPartnerWeeklyHours,
            "minimumPartnerWeeklyHours",
          ),
        }),
    ...(body.locationMode === undefined
      ? {}
      : {
          locationMode: enumValue(body.locationMode, "locationMode", [
            "remote",
            "hybrid",
            "onsite",
          ]),
        }),
  };
}

function asStartHandshakeInput(body: Record<string, unknown>): StartHandshakeInput {
  return { candidateOwnerId: requiredString(body.candidateOwnerId, "candidateOwnerId") };
}

function asAskQuestionInput(body: Record<string, unknown>): AskQuestionInput {
  return {
    toOwnerId: requiredString(body.toOwnerId, "toOwnerId"),
    predicate: requiredString(body.predicate, "predicate"),
    prompt: requiredString(body.prompt, "prompt"),
    ...(body.required === undefined
      ? {}
      : { required: requiredBoolean(body.required, "required") }),
  };
}

function asAnswerQuestionInput(body: Record<string, unknown>): AnswerQuestionInput {
  if (body.ownerConfirmed !== true) {
    throw new HttpRequestError(
      403,
      "DISCLOSURE_NOT_AUTHORIZED",
      "The owner must confirm every answer before disclosure.",
    );
  }
  const expiresAt = optionalString(body.expiresAt, "expiresAt");
  return {
    answer: requiredString(body.answer, "answer"),
    ownerConfirmed: true,
    ...(body.sourceType === undefined
      ? {}
      : {
          sourceType: enumValue(body.sourceType, "sourceType", ["owner_confirmed", "ai_inferred"]),
        }),
    ...(body.confidence === undefined
      ? {}
      : { confidence: enumValue(body.confidence, "confidence", ["high", "medium", "low"]) }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

function asRecommendationInput(body: Record<string, unknown>): SubmitRecommendationInput {
  return {
    recommendation: enumValue(body.recommendation, "recommendation", [
      "continue",
      "owner_review",
      "needs_info",
      "decline",
      "conflict",
    ]),
    summary: requiredString(body.summary, "summary"),
    ...(body.reasons === undefined ? {} : { reasons: stringArray(body.reasons, "reasons") }),
  };
}

function asDecisionInput(body: Record<string, unknown>): SubmitDecisionInput {
  return {
    decision: enumValue(body.decision, "decision", [
      "continue",
      "decline",
      "more_info",
      "needs_info",
    ]),
    consentVersion: requiredString(body.consentVersion, "consentVersion"),
  };
}

function asCheckInInput(body: Record<string, unknown>): AddCheckInInput {
  const blocker = optionalString(body.blocker, "blocker");
  return {
    day: requiredNumber(body.day, "day"),
    summary: requiredString(body.summary, "summary"),
    ...(blocker === undefined ? {} : { blocker }),
    ...(body.blockers === undefined ? {} : { blockers: stringArray(body.blockers, "blockers") }),
    nextStep: requiredString(body.nextStep, "nextStep"),
  };
}

function asArtifactInput(body: Record<string, unknown>): AddArtifactInput {
  return {
    title: requiredString(body.title, "title"),
    url: requiredString(body.url, "url"),
  };
}

function asFeedbackInput(body: Record<string, unknown>): AddFeedbackInput {
  const comment = optionalString(body.comment, "comment");
  const summary = optionalString(body.summary, "summary");
  return {
    ...(body.completed === undefined
      ? {}
      : { completed: requiredBoolean(body.completed, "completed") }),
    ...(body.rating === undefined ? {} : { rating: requiredNumber(body.rating, "rating") }),
    wouldCollaborateAgain: requiredBoolean(body.wouldCollaborateAgain, "wouldCollaborateAgain"),
    ...(comment === undefined ? {} : { comment }),
    ...(summary === undefined ? {} : { summary }),
  };
}

function matches(segments: readonly string[], ...expected: readonly string[]): boolean {
  return (
    segments.length === expected.length && expected.every((item, index) => segments[index] === item)
  );
}

function isResourceRoute(segments: readonly string[], first: string, second?: string): boolean {
  if (second === undefined) {
    return segments.length === 3 && segments[0] === "v1" && segments[1] === first;
  }
  return (
    segments.length === 4 && segments[0] === "v1" && segments[1] === first && segments[2] === second
  );
}

function isResourceAction(
  segments: readonly string[],
  first: string,
  second: string | undefined,
  action: string,
): boolean {
  if (second === undefined) {
    return (
      segments.length === 4 &&
      segments[0] === "v1" &&
      segments[1] === first &&
      segments[3] === action
    );
  }
  return (
    segments.length === 5 &&
    segments[0] === "v1" &&
    segments[1] === first &&
    segments[2] === second &&
    segments[4] === action
  );
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

async function readBodyObject(
  request: IncomingMessage,
  configuredLimit: number | undefined,
): Promise<Record<string, unknown>> {
  requireJson(request);
  const value = await readJsonBody(request, configuredLimit ?? DEFAULT_BODY_LIMIT_BYTES);
  if (!isRecord(value)) {
    throw new HttpRequestError(400, "INVALID_INPUT", "JSON body must be an object.");
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
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes <= limitBytes) chunks.push(buffer);
  }
  if (totalBytes > limitBytes) {
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

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidField(field, "must be a non-blank string");
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field);
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidField(field, "must be a finite number");
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw invalidField(field, "must be a boolean");
  return value;
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw invalidField(field, "must be an object");
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw invalidField(field, "must be an array of strings");
  }
  return value;
}

function enumValue<const T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw invalidField(field, `must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function invalidField(field: string, message: string): HttpRequestError {
  return new HttpRequestError(400, "INVALID_INPUT", `${field} ${message}.`, { field });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeData(response: ServerResponse, status: number, data: unknown): void {
  writeJson(response, status, { data });
}

function writeError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  if (error instanceof HttpRequestError) {
    writeJson(response, error.status, {
      error: {
        code: error.code,
        message: error.message,
        retryable: false,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }
  if (error instanceof ProductError) {
    writeJson(response, error.status, { error: error.toJSON() });
    return;
  }
  writeJson(response, 500, {
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected Platform API error.",
      retryable: true,
    },
  });
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

function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  staticDirectory: string,
  pathname: string,
): boolean {
  const root = resolve(staticDirectory);
  if (!existsSync(root)) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpRequestError(400, "INVALID_PATH", "Path contains invalid encoding.");
  }
  const candidate = resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw new HttpRequestError(400, "INVALID_PATH", "Static path leaves the public directory.");
  }
  let filePath = candidate;
  if (existsSync(filePath) && statSync(filePath).isDirectory())
    filePath = resolve(filePath, "index.html");
  if (!existsSync(filePath) || !statSync(filePath).isFile()) filePath = resolve(root, "index.html");
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;

  const stats = statSync(filePath);
  response.writeHead(200, {
    "content-type": contentType(filePath),
    "content-length": stats.size,
    "cache-control":
      extname(filePath) === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    "referrer-policy": "same-origin",
  });
  if (request.method === "HEAD") {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
  return true;
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}
