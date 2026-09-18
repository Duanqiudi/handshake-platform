import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FeasibilityGatewayService } from "@handshake/application";
import { type Handshake, validateHandshake } from "@handshake/domain";
import { createSyntheticEndpoint, type SyntheticEndpoint } from "@handshake/protocol-simulator";
import { SqliteHandshakeStore } from "@handshake/sqlite-store";
import { afterEach, describe, expect, it } from "vitest";
import { createGatewayHttpServer } from "../src/index.js";

const NOW = new Date("2026-09-14T10:00:00.000Z");
const COMMUNITY_ID = "community_alpha";
const SCENE = "professional_collaboration";
const PURPOSE = "find_product_design_partner";

interface RunningGateway {
  readonly baseUrl: string;
  close(): Promise<void>;
}

interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
}

const temporaryDirectories: string[] = [];
const runningGateways: RunningGateway[] = [];

afterEach(async () => {
  for (const gateway of runningGateways.splice(0)) {
    await gateway.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function newDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "handshake-gateway-"));
  temporaryDirectories.push(directory);
  return join(directory, "gateway.sqlite");
}

async function startGateway(databasePath: string): Promise<RunningGateway> {
  const store = new SqliteHandshakeStore({ path: databasePath });
  const service = new FeasibilityGatewayService({ store, now: () => new Date(NOW) });
  const server = createGatewayHttpServer({
    service,
    healthCheck: () => store.healthCheck(),
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo | null;
  if (address === null) {
    throw new Error("Gateway did not expose a TCP address.");
  }
  let closed = false;
  const gateway: RunningGateway = {
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
  runningGateways.push(gateway);
  return gateway;
}

async function requestJson(
  gateway: RunningGateway,
  path: string,
  options: {
    readonly method?: string;
    readonly body?: unknown;
    readonly callerCommunityId?: string;
  } = {},
): Promise<JsonResponse> {
  const headers: Record<string, string> = {
    "x-handshake-dev-community-id": options.callerCommunityId ?? COMMUNITY_ID,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${gateway.baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined
      ? {}
      : {
          body: JSON.stringify(options.body),
        }),
  });
  return { status: response.status, body: await response.json() };
}

async function createHandshake(
  gateway: RunningGateway,
  handshakeId: string,
  participants: readonly [string, string],
): Promise<Handshake> {
  const response = await requestJson(gateway, `/v1/communities/${COMMUNITY_ID}/handshakes`, {
    method: "POST",
    body: {
      handshake_id: handshakeId,
      scene: SCENE,
      purpose: PURPOSE,
      participant_endpoint_ids: participants,
    },
  });
  expect(response.status).toBe(201);
  return extractHandshake(response.body);
}

async function getHandshake(
  gateway: RunningGateway,
  communityId: string,
  handshakeId: string,
  callerCommunityId: string = COMMUNITY_ID,
): Promise<JsonResponse> {
  return requestJson(gateway, `/v1/communities/${communityId}/handshakes/${handshakeId}`, {
    callerCommunityId,
  });
}

async function sendMessage(
  gateway: RunningGateway,
  communityId: string,
  handshakeId: string,
  message: unknown,
  callerCommunityId: string = COMMUNITY_ID,
): Promise<JsonResponse> {
  return requestJson(gateway, `/v1/communities/${communityId}/handshakes/${handshakeId}/messages`, {
    method: "POST",
    body: message,
    callerCommunityId,
  });
}

function proposal(sender: SyntheticEndpoint, recipient: SyntheticEndpoint, handshake: Handshake) {
  return sender.createMessage({
    type: "PROPOSAL",
    handshakeId: handshake.id,
    recipientEndpointId: recipient.endpointId,
    stateVersion: handshake.version,
    expectedStatus: handshake.status,
    payload: {
      recommendation: "continue",
      evidence_claim_ids: [],
      conflict_ids: [],
      unknown_predicates: [],
      summary: "Synthetic feasibility proposal.",
      stop_code: "SUCCESS_PROPOSAL",
    },
  });
}

function consent(
  sender: SyntheticEndpoint,
  recipient: SyntheticEndpoint,
  handshake: Handshake,
  consentVersion = "consent-0.2",
) {
  return sender.createMessage({
    type: "OWNER_DECISION",
    handshakeId: handshake.id,
    recipientEndpointId: recipient.endpointId,
    stateVersion: handshake.version,
    expectedStatus: handshake.status,
    payload: {
      decision_id: `dec_${sender.endpointId}_${handshake.version}`,
      decision: "continue",
      consent_version: consentVersion,
      decided_at: NOW.toISOString(),
      owner_signature: `synthetic-owner-signature-${sender.endpointId}`,
    },
  });
}

function endpoints(suffix: string): readonly [SyntheticEndpoint, SyntheticEndpoint] {
  const clock = () => new Date(NOW);
  return [
    createSyntheticEndpoint({
      endpointId: `endpoint_alpha_${suffix}`,
      communityId: COMMUNITY_ID,
      now: clock,
    }),
    createSyntheticEndpoint({
      endpointId: `endpoint_beta_${suffix}`,
      communityId: COMMUNITY_ID,
      now: clock,
    }),
  ];
}

function extractHandshake(body: unknown): Handshake {
  if (!isRecord(body) || !isRecord(body.data) || !isRecord(body.data.handshake)) {
    throw new Error("Response did not contain a Handshake aggregate.");
  }
  const handshake = body.data.handshake as unknown as Handshake;
  expect(validateHandshake(handshake)).toEqual([]);
  return handshake;
}

function extractErrorCode(body: unknown): string {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.code !== "string") {
    throw new Error("Response did not contain a stable error code.");
  }
  return body.error.code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("Gateway API feasibility vertical slice", () => {
  it("survives required checkpoint restarts and reaches REVEALED through real HTTP", async () => {
    const databasePath = newDatabasePath();
    const handshakeId = "hs_http_restart";
    const [first, second] = endpoints("restart");

    const firstRun = await startGateway(databasePath);
    const health = await requestJson(firstRun, "/healthz");
    expect(health).toEqual({ status: 200, body: { status: "ok" } });
    let handshake = await createHandshake(firstRun, handshakeId, [
      first.endpointId,
      second.endpointId,
    ]);
    expect(handshake).toMatchObject({ status: "SCREENING", version: 5 });
    await firstRun.close();

    const secondRun = await startGateway(databasePath);
    handshake = extractHandshake((await getHandshake(secondRun, COMMUNITY_ID, handshakeId)).body);
    const contradictoryProposal = proposal(first, second, handshake);
    const invalidProposalResponse = await sendMessage(secondRun, COMMUNITY_ID, handshakeId, {
      ...contradictoryProposal,
      payload: { ...contradictoryProposal.payload, stop_code: "LOW_CONFIDENCE" },
    });
    expect(invalidProposalResponse.status).toBe(400);
    expect(extractErrorCode(invalidProposalResponse.body)).toBe("INVALID_SCHEMA");
    expect(
      extractHandshake((await getHandshake(secondRun, COMMUNITY_ID, handshakeId)).body),
    ).toMatchObject({ status: "SCREENING", version: 5, proposalParticipantIds: [] });

    const firstProposal = proposal(first, second, handshake);
    const firstProposalResponse = await sendMessage(
      secondRun,
      COMMUNITY_ID,
      handshakeId,
      firstProposal,
    );
    expect(firstProposalResponse.status).toBe(200);
    handshake = extractHandshake(firstProposalResponse.body);
    expect(handshake).toMatchObject({ status: "PROPOSAL", version: 6 });
    await secondRun.close();

    const thirdRun = await startGateway(databasePath);
    const exactReplay = await sendMessage(thirdRun, COMMUNITY_ID, handshakeId, firstProposal);
    expect(exactReplay.status).toBe(409);
    expect(extractErrorCode(exactReplay.body)).toBe("REPLAY_DETECTED");

    const reusedNonce = {
      ...proposal(first, second, handshake),
      message_id: "msg_changed_id_for_nonce_replay",
      nonce: firstProposal.nonce,
    };
    const nonceReplay = await sendMessage(thirdRun, COMMUNITY_ID, handshakeId, reusedNonce);
    expect(nonceReplay.status).toBe(409);
    expect(extractErrorCode(nonceReplay.body)).toBe("REPLAY_DETECTED");

    const oldSequence = {
      ...proposal(first, second, handshake),
      sequence: 1,
    };
    const sequenceReplay = await sendMessage(thirdRun, COMMUNITY_ID, handshakeId, oldSequence);
    expect(sequenceReplay.status).toBe(409);
    expect(extractErrorCode(sequenceReplay.body)).toBe("REPLAY_DETECTED");

    const crossCommunityRead = await getHandshake(
      thirdRun,
      "community_other",
      handshakeId,
      "community_other",
    );
    expect(crossCommunityRead.status).toBe(404);
    expect(extractErrorCode(crossCommunityRead.body)).toBe("HANDSHAKE_NOT_FOUND");
    const crossCommunityWrite = await sendMessage(
      thirdRun,
      "community_other",
      handshakeId,
      proposal(second, first, handshake),
      "community_other",
    );
    expect(crossCommunityWrite.status).toBe(404);
    expect(extractErrorCode(crossCommunityWrite.body)).toBe("ROUTE_MISMATCH");

    const communityBEnvelope = {
      ...proposal(second, first, handshake),
      community_id: "community_other",
    };
    const scopedMissingWrite = await sendMessage(
      thirdRun,
      "community_other",
      handshakeId,
      communityBEnvelope,
      "community_other",
    );
    expect(scopedMissingWrite.status).toBe(404);
    expect(extractErrorCode(scopedMissingWrite.body)).toBe("HANDSHAKE_NOT_FOUND");
    expect(JSON.stringify(scopedMissingWrite.body)).not.toContain(SCENE);
    expect(JSON.stringify(scopedMissingWrite.body)).not.toContain(PURPOSE);
    expect(JSON.stringify(scopedMissingWrite.body)).not.toContain(first.endpointId);
    expect(JSON.stringify(scopedMissingWrite.body)).not.toContain(second.endpointId);

    const wrongCallerContext = await getHandshake(
      thirdRun,
      COMMUNITY_ID,
      handshakeId,
      "community_other",
    );
    expect(wrongCallerContext.status).toBe(404);
    expect(extractErrorCode(wrongCallerContext.body)).toBe("COMMUNITY_CONTEXT_MISMATCH");

    const secondProposalResponse = await sendMessage(
      thirdRun,
      COMMUNITY_ID,
      handshakeId,
      proposal(second, first, handshake),
    );
    expect(secondProposalResponse.status).toBe(200);
    handshake = extractHandshake(secondProposalResponse.body);
    expect(handshake).toMatchObject({ status: "WAITING_DUAL_CONSENT", version: 7 });
    await thirdRun.close();

    const fourthRun = await startGateway(databasePath);
    const firstConsentResponse = await sendMessage(
      fourthRun,
      COMMUNITY_ID,
      handshakeId,
      consent(first, second, handshake),
    );
    expect(firstConsentResponse.status, JSON.stringify(firstConsentResponse.body)).toBe(200);
    handshake = extractHandshake(firstConsentResponse.body);
    expect(handshake).toMatchObject({ status: "WAITING_DUAL_CONSENT", version: 8 });
    expect(handshake.dualConsent?.consentVersion).toBe("consent-0.2");
    await fourthRun.close();

    const fifthRun = await startGateway(databasePath);
    const mismatchedConsentResponse = await sendMessage(
      fifthRun,
      COMMUNITY_ID,
      handshakeId,
      consent(second, first, handshake, "different-consent-version"),
    );
    expect(mismatchedConsentResponse.status).toBe(422);
    expect(extractErrorCode(mismatchedConsentResponse.body)).toBe("DOMAIN_COMMAND_REJECTED");
    expect(
      extractHandshake((await getHandshake(fifthRun, COMMUNITY_ID, handshakeId)).body),
    ).toMatchObject({ status: "WAITING_DUAL_CONSENT", version: 8 });
    const secondConsentResponse = await sendMessage(
      fifthRun,
      COMMUNITY_ID,
      handshakeId,
      consent(second, first, handshake),
    );
    expect(secondConsentResponse.status, JSON.stringify(secondConsentResponse.body)).toBe(200);
    handshake = extractHandshake(secondConsentResponse.body);
    expect(handshake).toMatchObject({ status: "REVEALED", version: 9 });
    expect(handshake.dualConsent?.decisions).toEqual([
      { participantId: first.endpointId, decision: "CONTINUE" },
      { participantId: second.endpointId, decision: "CONTINUE" },
    ]);
  });

  it("recovers from each same-version race and completes 20 full handshakes", async () => {
    const gateway = await startGateway(newDatabasePath());

    for (let index = 0; index < 20; index += 1) {
      const suffix = `race_${index}`;
      const handshakeId = `hs_http_${suffix}`;
      const [first, second] = endpoints(suffix);
      const handshake = await createHandshake(gateway, handshakeId, [
        first.endpointId,
        second.endpointId,
      ]);
      const responses = await Promise.all([
        sendMessage(gateway, COMMUNITY_ID, handshakeId, proposal(first, second, handshake)),
        sendMessage(gateway, COMMUNITY_ID, handshakeId, proposal(second, first, handshake)),
      ]);

      expect(
        responses.map(({ status }) => status).sort(),
        JSON.stringify(responses.map(({ status, body }) => ({ status, body }))),
      ).toEqual([200, 409]);
      const conflict = responses.find(({ status }) => status === 409);
      expect(extractErrorCode(conflict?.body)).toBe("CONCURRENT_MODIFICATION");
      const stored = extractHandshake(
        (await getHandshake(gateway, COMMUNITY_ID, handshakeId)).body,
      );
      expect(stored).toMatchObject({ status: "PROPOSAL", version: 6 });
      expect(stored.proposalParticipantIds).toHaveLength(1);

      const losingEndpoint = stored.proposalParticipantIds[0] === first.endpointId ? second : first;
      const winningEndpoint = losingEndpoint === first ? second : first;
      let continued = extractHandshake(
        (
          await sendMessage(
            gateway,
            COMMUNITY_ID,
            handshakeId,
            proposal(losingEndpoint, winningEndpoint, stored),
          )
        ).body,
      );
      expect(continued).toMatchObject({ status: "WAITING_DUAL_CONSENT", version: 7 });
      continued = extractHandshake(
        (await sendMessage(gateway, COMMUNITY_ID, handshakeId, consent(first, second, continued)))
          .body,
      );
      continued = extractHandshake(
        (await sendMessage(gateway, COMMUNITY_ID, handshakeId, consent(second, first, continued)))
          .body,
      );
      expect(continued).toMatchObject({ status: "REVEALED", version: 9 });
    }
  });
});
