import type { HspMessage, HspPayloadByType } from "@handshake/hsp-contracts";
import { describe, expect, it } from "vitest";
import {
  ApplicationError,
  canonicalSha256,
  FeasibilityGatewayService,
  mapHspMessageToCommand,
} from "../src/index.js";
import { FakeHandshakeStore } from "./fake-handshake-store.js";
import {
  createInput,
  makeMessage,
  NOW,
  ownerDecisionPayload,
  proposalPayload,
} from "./fixtures.js";

function setup(): { store: FakeHandshakeStore; service: FeasibilityGatewayService } {
  const store = new FakeHandshakeStore();
  return {
    store,
    service: new FeasibilityGatewayService({ store, now: () => NOW }),
  };
}

const route = { communityId: "community_alpha", handshakeId: "hs_feasibility" } as const;

describe("FeasibilityGatewayService", () => {
  it("creates the feasibility aggregate by walking every legal state into SCREENING", async () => {
    const { service } = setup();

    const handshake = await service.createScreeningHandshake(createInput);

    expect(handshake).toMatchObject({
      id: "hs_feasibility",
      communityId: "community_alpha",
      status: "SCREENING",
      version: 5,
    });
    expect(handshake.processedCommands).toHaveLength(5);
    await expect(service.getHandshake(route)).resolves.toEqual(handshake);
  });

  it("rejects duplicate feasibility creation with a stable code", async () => {
    const { service } = setup();
    await service.createScreeningHandshake(createInput);

    await expect(service.createScreeningHandshake(createInput)).rejects.toMatchObject({
      code: "HANDSHAKE_ALREADY_EXISTS",
    });
  });

  it("keeps lookup community-scoped instead of falling back to handshake id", async () => {
    const { service } = setup();
    await service.createScreeningHandshake(createInput);

    await expect(
      service.getHandshake({ communityId: "community_beta", handshakeId: "hs_feasibility" }),
    ).rejects.toMatchObject({ code: "HANDSHAKE_NOT_FOUND" });
  });

  it("preserves HSP schema, version, and TTL machine codes in ApplicationError", async () => {
    const { service } = setup();
    await service.createScreeningHandshake(createInput);

    await expect(
      service.receiveMessage({
        ...route,
        dto: makeMessage({
          id: "old",
          type: "PROPOSAL",
          payload: proposalPayload,
          stateVersion: 5,
          expiresAt: "2026-09-14T09:30:00.000Z",
        }),
      }),
    ).rejects.toMatchObject({
      name: "ApplicationError",
      code: "MESSAGE_EXPIRED",
      messageId: "msg_old",
      handshakeId: "hs_feasibility",
    });

    await expect(
      service.receiveMessage({
        ...route,
        dto: makeMessage({
          id: "future_version",
          type: "PROPOSAL",
          payload: proposalPayload,
          stateVersion: 5,
          protocolVersion: "0.3.0",
        }),
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_PROTOCOL_VERSION" });
  });

  it("checks route, tenant, endpoints, and state before domain execution", async () => {
    const { service } = setup();
    await service.createScreeningHandshake(createInput);
    const proposal = makeMessage({
      id: "scope",
      type: "PROPOSAL",
      payload: proposalPayload,
      stateVersion: 5,
      expectedStatus: "SCREENING",
    });

    await expect(
      service.receiveMessage({
        communityId: "community_beta",
        handshakeId: "hs_feasibility",
        dto: proposal,
      }),
    ).rejects.toMatchObject({ code: "ROUTE_MISMATCH" });

    await expect(
      service.receiveMessage({
        ...route,
        dto: { ...proposal, sender_endpoint_id: "agent_intruder" },
      }),
    ).rejects.toMatchObject({ code: "PARTICIPANT_SCOPE_VIOLATION" });

    await expect(
      service.receiveMessage({ ...route, dto: { ...proposal, state_version: 4 } }),
    ).rejects.toMatchObject({ code: "CONCURRENT_MODIFICATION", retryable: true });
  });

  it("maps proposals explicitly and commits version plus audit metadata atomically", async () => {
    const { service, store } = setup();
    await service.createScreeningHandshake(createInput);
    const message = makeMessage({
      id: "proposal_alpha",
      type: "PROPOSAL",
      payload: proposalPayload,
      stateVersion: 5,
      expectedStatus: "SCREENING",
    });

    const received = await service.receiveMessage({ ...route, dto: message });

    expect(received.command).toEqual({ type: "SUBMIT_PROPOSAL", participantId: "agent_alpha" });
    expect(received.envelopeDigest).toBe(canonicalSha256(message));
    expect(received.commandDigest).toBe(canonicalSha256(received.command));
    expect(store.commits[0]).toMatchObject({
      communityId: "community_alpha",
      handshakeId: "hs_feasibility",
      expectedVersion: 5,
      fromStatus: "SCREENING",
      message: {
        messageId: "msg_proposal_alpha",
        senderEndpointId: "agent_alpha",
        sequence: 1,
        nonce: "nonce_proposal_alpha_abcdefghijklmnop",
        envelopeDigest: received.envelopeDigest,
      },
      occurredAt: NOW.toISOString(),
    });
  });

  it("reaches REVEALED only after two proposals and two independent owner consents", async () => {
    const { service } = setup();
    let handshake = await service.createScreeningHandshake(createInput);

    const proposalAlpha = await service.receiveMessage({
      ...route,
      dto: makeMessage({
        id: "proposal_a",
        type: "PROPOSAL",
        payload: proposalPayload,
        stateVersion: handshake.version,
        expectedStatus: handshake.status,
      }),
    });
    handshake = proposalAlpha.handshake;
    expect(handshake.proposalParticipantIds).toEqual(["agent_alpha"]);

    const proposalBeta = await service.receiveMessage({
      ...route,
      dto: makeMessage({
        id: "proposal_b",
        type: "PROPOSAL",
        payload: proposalPayload,
        sender: "agent_beta",
        recipient: "agent_alpha",
        stateVersion: handshake.version,
        expectedStatus: handshake.status,
      }),
    });
    handshake = proposalBeta.handshake;
    expect(handshake.status).toBe("WAITING_DUAL_CONSENT");

    const consentAlpha = await service.receiveMessage({
      ...route,
      dto: makeMessage({
        id: "consent_a",
        type: "OWNER_DECISION",
        payload: ownerDecisionPayload("continue"),
        sequence: 2,
        stateVersion: handshake.version,
        expectedStatus: "WAITING_DUAL_CONSENT",
      }),
    });
    handshake = consentAlpha.handshake;
    expect(handshake.status).toBe("WAITING_DUAL_CONSENT");

    const consentBeta = await service.receiveMessage({
      ...route,
      dto: makeMessage({
        id: "consent_b",
        type: "OWNER_DECISION",
        payload: ownerDecisionPayload("continue"),
        sender: "agent_beta",
        recipient: "agent_alpha",
        sequence: 2,
        stateVersion: handshake.version,
        expectedStatus: "WAITING_DUAL_CONSENT",
      }),
    });
    expect(consentBeta.handshake.status).toBe("REVEALED");
  });

  it("rejects unhandled but schema-valid HSP messages by default", async () => {
    const { service } = setup();
    await service.createScreeningHandshake(createInput);
    const questionPayload: HspPayloadByType["QUESTION"] = {
      round: 1,
      questions: [
        {
          question_id: "q_skill",
          predicate: "skill.product_design",
          required: true,
        },
      ],
    };

    await expect(
      service.receiveMessage({
        ...route,
        dto: makeMessage({
          id: "question",
          type: "QUESTION",
          payload: questionPayload,
          stateVersion: 5,
          expectedStatus: "SCREENING",
        }),
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MESSAGE_TYPE" });
  });

  it("does not turn a decline proposal into a continue-domain command", () => {
    const decline = makeMessage({
      id: "proposal_decline",
      type: "PROPOSAL",
      payload: {
        recommendation: "decline",
        evidence_claim_ids: proposalPayload.evidence_claim_ids,
        conflict_ids: proposalPayload.conflict_ids,
        unknown_predicates: proposalPayload.unknown_predicates,
        summary: proposalPayload.summary,
        stop_code: "LOW_CONFIDENCE",
      },
      stateVersion: 5,
      expectedStatus: "SCREENING",
    });

    expect(() => mapHspMessageToCommand(decline)).toThrowError(
      expect.objectContaining({ code: "DOMAIN_COMMAND_REJECTED" }),
    );
  });

  it("rejects a continue proposal carrying a contradictory stop code", () => {
    const valid = makeMessage({
      id: "proposal_low_confidence",
      type: "PROPOSAL",
      payload: proposalPayload,
      stateVersion: 5,
      expectedStatus: "SCREENING",
    });
    const contradictory = {
      ...valid,
      payload: { ...valid.payload, stop_code: "LOW_CONFIDENCE" },
    } as unknown as HspMessage;

    expect(() => mapHspMessageToCommand(contradictory)).toThrowError(
      expect.objectContaining({ code: "DOMAIN_COMMAND_REJECTED" }),
    );
  });

  it("does not reveal when owner decisions reference different consent versions", async () => {
    const { service } = setup();
    let handshake = await service.createScreeningHandshake(createInput);
    for (const input of [
      { id: "version_proposal_a", sender: "agent_alpha", recipient: "agent_beta" },
      { id: "version_proposal_b", sender: "agent_beta", recipient: "agent_alpha" },
    ] as const) {
      handshake = (
        await service.receiveMessage({
          ...route,
          dto: makeMessage({
            ...input,
            type: "PROPOSAL",
            payload: proposalPayload,
            stateVersion: handshake.version,
            expectedStatus: handshake.status,
          }),
        })
      ).handshake;
    }

    handshake = (
      await service.receiveMessage({
        ...route,
        dto: makeMessage({
          id: "version_consent_a",
          type: "OWNER_DECISION",
          payload: ownerDecisionPayload("continue", "proposal-version-a"),
          sequence: 2,
          stateVersion: handshake.version,
          expectedStatus: "WAITING_DUAL_CONSENT",
        }),
      })
    ).handshake;

    await expect(
      service.receiveMessage({
        ...route,
        dto: makeMessage({
          id: "version_consent_b",
          type: "OWNER_DECISION",
          payload: ownerDecisionPayload("continue", "proposal-version-b"),
          sender: "agent_beta",
          recipient: "agent_alpha",
          sequence: 2,
          stateVersion: handshake.version,
          expectedStatus: "WAITING_DUAL_CONSENT",
        }),
      }),
    ).rejects.toMatchObject({
      code: "DOMAIN_COMMAND_REJECTED",
      details: { domain_code: "CONSENT_VERSION_MISMATCH" },
    });

    const persisted = await service.getHandshake(route);
    expect(persisted).toMatchObject({
      status: "WAITING_DUAL_CONSENT",
      version: handshake.version,
      dualConsent: {
        consentVersion: "proposal-version-a",
        decisions: [
          { participantId: "agent_alpha", decision: "CONTINUE" },
          { participantId: "agent_beta", decision: "PENDING" },
        ],
      },
    });

    const retried = await service.receiveMessage({
      ...route,
      dto: makeMessage({
        id: "version_consent_b_retry",
        type: "OWNER_DECISION",
        payload: ownerDecisionPayload("continue", "proposal-version-a"),
        sender: "agent_beta",
        recipient: "agent_alpha",
        sequence: 2,
        stateVersion: persisted.version,
        expectedStatus: "WAITING_DUAL_CONSENT",
      }),
    });
    expect(retried.handshake).toMatchObject({
      status: "REVEALED",
      dualConsent: { consentVersion: "proposal-version-a" },
    });
  });

  it("rejects clarify while the feasibility flow has no clarification round", () => {
    const clarify = makeMessage({
      id: "decision_clarify",
      type: "OWNER_DECISION",
      payload: ownerDecisionPayload("clarify"),
      stateVersion: 7,
      expectedStatus: "WAITING_DUAL_CONSENT",
    });

    expect(() => mapHspMessageToCommand(clarify)).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_MESSAGE_TYPE" }),
    );
  });

  it("maps durable replay and optimistic concurrency outcomes to stable HSP codes", async () => {
    const { service, store } = setup();
    await service.createScreeningHandshake(createInput);
    const proposal = makeMessage({
      id: "storage_outcome",
      type: "PROPOSAL",
      payload: proposalPayload,
      stateVersion: 5,
      expectedStatus: "SCREENING",
    });

    store.nextCommitResult = "REPLAY_DETECTED";
    await expect(service.receiveMessage({ ...route, dto: proposal })).rejects.toMatchObject({
      code: "REPLAY_DETECTED",
      retryable: false,
    });

    store.nextCommitResult = "CONCURRENT_MODIFICATION";
    await expect(service.receiveMessage({ ...route, dto: proposal })).rejects.toMatchObject({
      code: "CONCURRENT_MODIFICATION",
      retryable: true,
    });
  });

  it("detects a durable replay before stale state validation after the first commit", async () => {
    const { service } = setup();
    await service.createScreeningHandshake(createInput);
    const proposal = makeMessage({
      id: "durable_replay",
      type: "PROPOSAL",
      payload: proposalPayload,
      stateVersion: 5,
      expectedStatus: "SCREENING",
    });
    await service.receiveMessage({ ...route, dto: proposal });

    await expect(service.receiveMessage({ ...route, dto: proposal })).rejects.toMatchObject({
      code: "REPLAY_DETECTED",
    });
  });

  it("rejects an old sender sequence after persistence even with fresh replay keys", async () => {
    const { service } = setup();
    await service.createScreeningHandshake(createInput);
    await service.receiveMessage({
      ...route,
      dto: makeMessage({
        id: "sequence_first",
        type: "PROPOSAL",
        payload: proposalPayload,
        stateVersion: 5,
        expectedStatus: "SCREENING",
        sequence: 2,
      }),
    });
    const outOfOrder = makeMessage({
      id: "sequence_old",
      type: "PROPOSAL",
      payload: proposalPayload,
      stateVersion: 6,
      expectedStatus: "PROPOSAL",
      sequence: 1,
    });

    await expect(service.receiveMessage({ ...route, dto: outOfOrder })).rejects.toMatchObject({
      code: "REPLAY_DETECTED",
    });
  });

  it("serializes ApplicationError for a future transport adapter", () => {
    const error = new ApplicationError({
      code: "HANDSHAKE_NOT_FOUND",
      message: "missing",
      handshakeId: "hs_missing",
    });

    expect(error.toJSON()).toEqual({
      code: "HANDSHAKE_NOT_FOUND",
      message: "missing",
      retryable: false,
      handshake_id: "hs_missing",
    });
  });
});
