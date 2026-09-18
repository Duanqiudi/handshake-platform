import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProductApplicationService } from "@handshake/product-application";
import { SqliteProductStore } from "@handshake/product-sqlite-store";
import { afterEach, describe, expect, it } from "vitest";
import { createPlatformHttpServer, type PlatformHttpServerOptions } from "../src/index.js";

interface RunningPlatform {
  readonly baseUrl: string;
  close(): Promise<void>;
}

interface JsonResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

const runningPlatforms: RunningPlatform[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const platform of runningPlatforms.splice(0)) await platform.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function startPlatform(
  overrides: Partial<Omit<PlatformHttpServerOptions, "service" | "healthCheck">> = {},
): Promise<RunningPlatform> {
  const store = new SqliteProductStore({ path: ":memory:" });
  const service = new ProductApplicationService({ store });
  const server = createPlatformHttpServer({
    service,
    healthCheck: () => store.healthCheck(),
    ...overrides,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo | null;
  if (address === null) throw new Error("Platform API did not expose a TCP address.");
  let closed = false;
  const running: RunningPlatform = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      store.close();
    },
  };
  runningPlatforms.push(running);
  return running;
}

async function jsonRequest(
  platform: RunningPlatform,
  path: string,
  options: {
    readonly method?: string;
    readonly body?: unknown;
    readonly token?: string;
    readonly origin?: string;
  } = {},
): Promise<JsonResponse> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  if (options.origin !== undefined) headers.origin = options.origin;
  const response = await fetch(`${platform.baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

function record(value: unknown, label = "value"): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} is not an object.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function data(value: unknown): unknown {
  return record(value, "response").data;
}

function demoOwners(value: unknown): Array<{
  owner: Record<string, unknown>;
  token: string;
}> {
  const result = record(data(value), "demo data");
  if (!Array.isArray(result.owners)) throw new Error("Demo owners are missing.");
  return result.owners.map((item) => {
    const entry = record(item, "demo owner entry");
    const owner = record(entry.owner, "demo owner");
    if (typeof entry.token !== "string") throw new Error("Demo token is missing.");
    return { owner, token: entry.token };
  });
}

function ownerByName(
  owners: ReturnType<typeof demoOwners>,
  displayName: string,
): ReturnType<typeof demoOwners>[number] {
  const found = owners.find((entry) => entry.owner.displayName === displayName);
  if (found === undefined) throw new Error(`Demo owner ${displayName} is missing.`);
  return found;
}

describe("Handshake V1 Platform API", () => {
  it("keeps every partner contact private until matching dual consent", async () => {
    const platform = await startPlatform({ demoMode: true });
    const health = await jsonRequest(platform, "/healthz");
    expect(health).toMatchObject({ status: 200, body: { data: { status: "ok" } } });

    const reset = await jsonRequest(platform, "/v1/demo/reset", { method: "POST" });
    expect(reset.status).toBe(200);
    const resetJson = JSON.stringify(reset.body);
    expect(resetJson).not.toContain("linran@demo.example.test");
    expect(resetJson).not.toContain("chenmo-demo");
    const owners = demoOwners(reset.body);
    const lin = ownerByName(owners, "林然");
    const chen = ownerByName(owners, "陈默");
    expect(lin.owner).not.toHaveProperty("contact");
    expect(chen.owner).not.toHaveProperty("contact");

    const unauthenticated = await jsonRequest(platform, "/v1/discovery/candidates");
    expect(unauthenticated).toMatchObject({
      status: 401,
      body: {
        error: {
          code: "AUTHENTICATION_REQUIRED",
          retryable: false,
        },
      },
    });

    const linDashboard = await jsonRequest(platform, "/v1/me/dashboard", { token: lin.token });
    expect(linDashboard.status).toBe(200);
    expect(JSON.stringify(linDashboard.body)).not.toContain("chenmo-demo");
    const chenDashboard = await jsonRequest(platform, "/v1/me/dashboard", {
      token: chen.token,
    });
    expect(chenDashboard.status).toBe(200);
    expect(JSON.stringify(chenDashboard.body)).not.toContain("linran@demo.example.test");

    const candidates = await jsonRequest(platform, "/v1/discovery/candidates", {
      token: lin.token,
    });
    expect(candidates.status).toBe(200);
    expect(JSON.stringify(candidates.body)).not.toContain("chenmo-demo");

    const started = await jsonRequest(platform, "/v1/handshakes", {
      method: "POST",
      token: lin.token,
      body: { candidateOwnerId: chen.owner.id },
    });
    expect(started.status).toBe(201);
    const startedView = record(data(started.body), "started handshake");
    const handshakeId = startedView.id;
    if (typeof handshakeId !== "string") throw new Error("Handshake id is missing.");
    expect(startedView.contactReveal).toBeNull();
    expect(JSON.stringify(started.body)).not.toContain("chenmo-demo");

    const asked = await jsonRequest(platform, `/v1/handshakes/${handshakeId}/questions`, {
      method: "POST",
      token: lin.token,
      body: {
        toOwnerId: chen.owner.id,
        predicate: "availability",
        prompt: "你可以每天做一次异步更新吗？",
        required: true,
      },
    });
    expect(asked.status).toBe(200);
    expect(record(data(asked.body)).pendingQuestions).toEqual([]);

    const pendingForChen = await jsonRequest(platform, `/v1/handshakes/${handshakeId}/view`, {
      token: chen.token,
    });
    const pendingQuestions = record(data(pendingForChen.body)).pendingQuestions;
    expect(pendingQuestions).toEqual([
      expect.objectContaining({ prompt: "你可以每天做一次异步更新吗？" }),
    ]);
    if (!Array.isArray(pendingQuestions) || !isRecord(pendingQuestions[0])) {
      throw new Error("Pending question id is missing.");
    }
    const questionId = pendingQuestions[0].id;
    if (typeof questionId !== "string") throw new Error("Pending question id is missing.");
    const answered = await jsonRequest(
      platform,
      `/v1/handshakes/${handshakeId}/questions/${questionId}/answer`,
      {
        method: "POST",
        token: chen.token,
        body: {
          answer: "可以，工作日晚上会更新一次。",
          ownerConfirmed: true,
          sourceType: "owner_confirmed",
          confidence: "high",
        },
      },
    );
    expect(answered.status).toBe(200);
    expect(JSON.stringify(answered.body)).not.toContain("linran@demo.example.test");

    const firstRecommendation = await jsonRequest(
      platform,
      `/v1/handshakes/${handshakeId}/recommendations`,
      {
        method: "POST",
        token: lin.token,
        body: {
          recommendation: "continue",
          summary: "技能互补，建议继续",
          reasons: ["一方懂产品，一方懂开发"],
        },
      },
    );
    expect(firstRecommendation.status).toBe(200);
    expect(record(data(firstRecommendation.body)).contactReveal).toBeNull();

    const secondRecommendation = await jsonRequest(
      platform,
      `/v1/handshakes/${handshakeId}/recommendations`,
      {
        method: "POST",
        token: chen.token,
        body: {
          recommendation: "continue",
          summary: "目标一致，建议继续",
        },
      },
    );
    expect(secondRecommendation.status).toBe(200);
    const proposalView = record(data(secondRecommendation.body), "proposal handshake");
    expect(proposalView.contactReveal).toBeNull();
    if (typeof proposalView.consentVersion !== "string") {
      throw new Error("Consent version is missing.");
    }

    const firstDecision = await jsonRequest(platform, `/v1/handshakes/${handshakeId}/decisions`, {
      method: "POST",
      token: lin.token,
      body: { decision: "continue", consentVersion: proposalView.consentVersion },
    });
    expect(firstDecision.status).toBe(200);
    expect(record(data(firstDecision.body)).contactReveal).toBeNull();
    expect(JSON.stringify(firstDecision.body)).not.toContain("chenmo-demo");

    const partnerViewBeforeConsent = await jsonRequest(
      platform,
      `/v1/handshakes/${handshakeId}/view`,
      { token: chen.token },
    );
    expect(partnerViewBeforeConsent.status).toBe(200);
    expect(record(data(partnerViewBeforeConsent.body)).contactReveal).toBeNull();
    expect(JSON.stringify(partnerViewBeforeConsent.body)).not.toContain("linran@demo.example.test");

    const secondDecision = await jsonRequest(platform, `/v1/handshakes/${handshakeId}/decisions`, {
      method: "POST",
      token: chen.token,
      body: { decision: "continue", consentVersion: proposalView.consentVersion },
    });
    expect(secondDecision.status).toBe(200);
    const revealedView = record(data(secondDecision.body), "revealed handshake");
    expect(revealedView.projectId).toEqual(expect.any(String));
    expect(revealedView.contactReveal).not.toBeNull();
    expect(JSON.stringify(secondDecision.body)).toContain("linran@demo.example.test");
    expect(JSON.stringify(secondDecision.body)).toContain("chenmo-demo");

    const projectId = revealedView.projectId;
    if (typeof projectId !== "string") throw new Error("Project id is missing.");
    const checkIn = await jsonRequest(platform, `/v1/projects/${projectId}/check-ins`, {
      method: "POST",
      token: lin.token,
      body: { day: 1, summary: "确定用户问题", nextStep: "画出流程图" },
    });
    expect(checkIn.status).toBe(200);
    const artifact = await jsonRequest(platform, `/v1/projects/${projectId}/artifacts`, {
      method: "POST",
      token: chen.token,
      body: { title: "演示地址", url: "https://portfolio.example/demo" },
    });
    expect(artifact.status).toBe(200);
    const listedProject = await jsonRequest(platform, `/v1/projects/${projectId}`, {
      token: lin.token,
    });
    expect(listedProject.status).toBe(200);
    expect(record(data(listedProject.body))).toMatchObject({
      id: projectId,
      checkIns: [expect.objectContaining({ day: 1 })],
      artifacts: [expect.objectContaining({ title: "演示地址" })],
    });

    const receipts = await jsonRequest(platform, "/v1/privacy/receipts", { token: lin.token });
    expect(receipts.status).toBe(200);
    const receiptList = data(receipts.body);
    if (!Array.isArray(receiptList)) throw new Error("Privacy receipt list is missing.");
    const contactReceipt = receiptList.find(
      (item) => isRecord(item) && item.kind === "contact_reveal",
    );
    if (!isRecord(contactReceipt) || typeof contactReceipt.id !== "string") {
      throw new Error("Contact reveal receipt is missing.");
    }
    expect(contactReceipt.revokedAt).toBeNull();

    const capsules = await jsonRequest(platform, "/v1/me/capsules", { token: lin.token });
    const capsuleList = data(capsules.body);
    if (!Array.isArray(capsuleList) || !isRecord(capsuleList[0])) {
      throw new Error("Published Capsule is missing.");
    }
    const capsuleId = capsuleList[0].id;
    if (typeof capsuleId !== "string") throw new Error("Capsule id is missing.");
    const revoked = await jsonRequest(platform, `/v1/me/capsules/${capsuleId}/revoke`, {
      method: "POST",
      token: lin.token,
    });
    expect(revoked.status).toBe(200);
    expect(record(data(revoked.body)).status).toBe("revoked");

    const receiptsAfterRevoke = await jsonRequest(platform, "/v1/privacy/receipts", {
      token: lin.token,
    });
    const receiptListAfterRevoke = data(receiptsAfterRevoke.body);
    if (!Array.isArray(receiptListAfterRevoke)) {
      throw new Error("Privacy receipt list is missing after Capsule revocation.");
    }
    expect(
      receiptListAfterRevoke.find((item) => isRecord(item) && item.kind === "capsule_publish"),
    ).toMatchObject({ revokedAt: expect.any(String) });
    expect(
      receiptListAfterRevoke.find((item) => isRecord(item) && item.kind === "contact_reveal"),
    ).toMatchObject({ revokedAt: null });
  });

  it("hides demo reset unless enabled and enforces an optional onboarding invite", async () => {
    const platform = await startPlatform({ onboardingInviteCode: "portfolio-2026" });
    const hiddenReset = await jsonRequest(platform, "/v1/demo/reset", { method: "POST" });
    expect(hiddenReset).toMatchObject({
      status: 404,
      body: { error: { code: "ROUTE_NOT_FOUND", retryable: false } },
    });

    const rejected = await jsonRequest(platform, "/v1/onboarding", {
      method: "POST",
      body: {
        inviteCode: "wrong",
        displayName: "测试用户",
        contactChannel: "email",
        contactValue: "test@example.test",
      },
    });
    expect(rejected).toMatchObject({
      status: 403,
      body: { error: { code: "INVALID_INVITE_CODE", retryable: false } },
    });

    const onboarded = await jsonRequest(platform, "/v1/onboarding", {
      method: "POST",
      body: {
        inviteCode: "portfolio-2026",
        displayName: "测试用户",
        contactChannel: "email",
        contactValue: "test@example.test",
      },
    });
    expect(onboarded.status).toBe(201);
    expect(record(data(onboarded.body))).toMatchObject({
      owner: { displayName: "测试用户" },
      token: expect.any(String),
    });
  });

  it("wires connection, Capsule, intent and receipt routes to the application service", async () => {
    const platform = await startPlatform();
    const onboarded = await jsonRequest(platform, "/v1/onboarding", {
      method: "POST",
      body: {
        displayName: "作品集新人",
        contact: { kind: "wechat", value: "portfolio-newcomer" },
      },
    });
    expect(onboarded.status).toBe(201);
    const onboardingData = record(data(onboarded.body));
    if (typeof onboardingData.token !== "string") throw new Error("Owner token is missing.");
    const token = onboardingData.token;

    const createdConnection = await jsonRequest(platform, "/v1/me/connections", {
      method: "POST",
      token,
      body: { provider: "chatgpt", mode: "capsule_import", label: "我的 ChatGPT" },
    });
    expect(createdConnection.status).toBe(201);
    const connection = record(data(createdConnection.body));
    expect(connection).toMatchObject({ sourceMode: "import", label: "我的 ChatGPT" });
    if (typeof connection.id !== "string") throw new Error("Connection id is missing.");
    const updatedConnection = await jsonRequest(platform, `/v1/me/connections/${connection.id}`, {
      method: "PATCH",
      token,
      body: { label: "求职搭档 ChatGPT" },
    });
    expect(updatedConnection.status).toBe(200);
    expect(record(data(updatedConnection.body)).label).toBe("求职搭档 ChatGPT");

    const imported = await jsonRequest(platform, "/v1/me/capsules/import", {
      method: "POST",
      token,
      body: {
        connectionId: connection.id,
        fields: {
          goal: "7 天完成一个作品集项目",
          offers: ["用户研究"],
          seeks: ["TypeScript"],
          availability: "工作日晚间，每周 6 小时",
          collaborationStyles: ["异步优先"],
          projectInterests: ["AI 求职"],
          location: "远程",
          languages: ["中文"],
        },
      },
    });
    expect(imported.status).toBe(201);
    const capsule = record(data(imported.body));
    expect(capsule).toMatchObject({ status: "draft", approvedFields: [] });
    if (typeof capsule.id !== "string") throw new Error("Capsule id is missing.");
    const approvedFields = [
      "goal",
      "offers",
      "seeks",
      "availability",
      "collaborationStyles",
      "projectInterests",
      "location",
      "languages",
    ];
    const updatedCapsule = await jsonRequest(platform, `/v1/me/capsules/${capsule.id}`, {
      method: "PATCH",
      token,
      body: { fields: capsule.fields, approvedFields },
    });
    expect(updatedCapsule.status).toBe(200);
    const published = await jsonRequest(platform, `/v1/me/capsules/${capsule.id}/publish`, {
      method: "POST",
      token,
    });
    expect(published.status).toBe(200);
    expect(record(data(published.body)).status).toBe("published");

    const createdIntent = await jsonRequest(platform, "/v1/me/intents", {
      method: "POST",
      token,
      body: {
        capsuleId: capsule.id,
        title: "AI 求职助手",
        summary: "验证作品集搭档协作",
        desiredArtifact: "可运行 Web Demo",
      },
    });
    expect(createdIntent.status).toBe(201);
    const intent = record(data(createdIntent.body));
    if (typeof intent.id !== "string") throw new Error("Intent id is missing.");
    const paused = await jsonRequest(platform, `/v1/me/intents/${intent.id}/pause`, {
      method: "POST",
      token,
    });
    expect(paused.status).toBe(200);
    expect(record(data(paused.body)).status).toBe("paused");

    const receipts = await jsonRequest(platform, "/v1/privacy/receipts", { token });
    expect(receipts.status).toBe(200);
    expect(data(receipts.body)).toEqual([expect.objectContaining({ kind: "capsule_publish" })]);
    const revokedCapsule = await jsonRequest(platform, `/v1/me/capsules/${capsule.id}/revoke`, {
      method: "POST",
      token,
    });
    expect(revokedCapsule.status).toBe(200);
    expect(record(data(revokedCapsule.body)).status).toBe("revoked");
  });

  it("serves the member SPA and applies the configured CORS allowlist", async () => {
    const directory = mkdtempSync(join(tmpdir(), "handshake-member-web-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "index.html"), "<!doctype html><title>Handshake Member</title>");
    const platform = await startPlatform({
      staticDirectory: directory,
      corsAllowedOrigins: ["https://portfolio.example"],
    });

    const page = await fetch(`${platform.baseUrl}/handshakes/example`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("permissions-policy")).toContain("camera=()");
    expect(await page.text()).toContain("Handshake Member");

    const denied = await jsonRequest(platform, "/healthz", {
      origin: "https://attacker.example",
    });
    expect(denied).toMatchObject({
      status: 403,
      body: { error: { code: "CORS_ORIGIN_DENIED", retryable: false } },
    });
    const allowed = await jsonRequest(platform, "/healthz", {
      origin: "https://portfolio.example",
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://portfolio.example");
  });
});
