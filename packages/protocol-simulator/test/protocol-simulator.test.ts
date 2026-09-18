import { describe, expect, it } from "vitest";
import {
  createSyntheticEndpoint,
  InMemoryProtocolSimulator,
  type SyntheticEndpoint,
} from "../src/index.js";

const NOW = new Date("2026-09-14T10:00:00.000Z");
const COMMUNITY_ID = "community_alpha";
const HANDSHAKE_ID = "hs_alpha";

interface Scenario {
  readonly first: SyntheticEndpoint;
  readonly second: SyntheticEndpoint;
  readonly simulator: InMemoryProtocolSimulator;
}

function createScenario(): Scenario {
  const clock = () => new Date(NOW);
  const first = createSyntheticEndpoint({
    endpointId: "endpoint_alpha",
    communityId: COMMUNITY_ID,
    now: clock,
  });
  const second = createSyntheticEndpoint({
    endpointId: "endpoint_beta",
    communityId: COMMUNITY_ID,
    now: clock,
  });
  return {
    first,
    second,
    simulator: new InMemoryProtocolSimulator({
      handshakeId: HANDSHAKE_ID,
      communityId: COMMUNITY_ID,
      scene: "professional_collaboration",
      purpose: "find_product_design_partner",
      endpoints: [first, second],
      now: clock,
    }),
  };
}

function proposal(
  sender: SyntheticEndpoint,
  recipient: SyntheticEndpoint,
  simulator: InMemoryProtocolSimulator,
  overrides: { readonly communityId?: string; readonly stateVersion?: number } = {},
) {
  return sender.createMessage({
    type: "PROPOSAL",
    handshakeId: HANDSHAKE_ID,
    ...(overrides.communityId === undefined ? {} : { communityId: overrides.communityId }),
    recipientEndpointId: recipient.endpointId,
    stateVersion: overrides.stateVersion ?? simulator.handshake.version,
    expectedStatus: simulator.handshake.status,
    payload: {
      recommendation: "continue",
      evidence_claim_ids: [],
      conflict_ids: [],
      unknown_predicates: [],
      summary: "Both synthetic Endpoints recommend continuing.",
      stop_code: "SUCCESS_PROPOSAL",
    },
  });
}

function consent(
  sender: SyntheticEndpoint,
  recipient: SyntheticEndpoint,
  simulator: InMemoryProtocolSimulator,
) {
  return sender.createMessage({
    type: "OWNER_DECISION",
    handshakeId: HANDSHAKE_ID,
    recipientEndpointId: recipient.endpointId,
    stateVersion: simulator.handshake.version,
    expectedStatus: simulator.handshake.status,
    payload: {
      decision_id: `dec_${sender.endpointId}`,
      decision: "continue",
      consent_version: "consent-0.2",
      decided_at: NOW.toISOString(),
      owner_signature: `owner-signature-${sender.endpointId}`,
    },
  });
}

function terminate(
  sender: SyntheticEndpoint,
  recipient: SyntheticEndpoint,
  simulator: InMemoryProtocolSimulator,
) {
  return sender.createMessage({
    type: "TERMINATE",
    handshakeId: HANDSHAKE_ID,
    recipientEndpointId: recipient.endpointId,
    stateVersion: simulator.handshake.version,
    expectedStatus: simulator.handshake.status,
    payload: {
      stop_code: "TIMEOUT",
      final_status: "EXPIRED",
      summary: "The synthetic handshake reached its deadline.",
      known_claim_ids: [],
      unknown_predicates: [],
      retryable: false,
      terminated_at: NOW.toISOString(),
    },
  });
}

function expectRejected(
  result: ReturnType<InMemoryProtocolSimulator["receive"]>,
  code: string,
): void {
  expect(result.accepted).toBe(false);
  if (result.accepted) {
    throw new Error("Expected the simulator to reject the message.");
  }
  expect(result.rejection.code).toBe(code);
}

describe("two-Endpoint in-memory HSP vertical slice", () => {
  it("runs the minimum DRAFT-to-REVEALED path through validated DTO mappings", () => {
    const { first, second, simulator } = createScenario();

    simulator.bootstrapToScreening();
    expect(simulator.handshake).toMatchObject({ status: "SCREENING", version: 5 });

    const firstProposal = simulator.receive(proposal(first, second, simulator));
    expect(firstProposal.accepted).toBe(true);
    if (!firstProposal.accepted) {
      throw new Error("First proposal should be accepted.");
    }
    expect(firstProposal.command).toEqual({
      type: "SUBMIT_PROPOSAL",
      participantId: first.endpointId,
    });
    expect(firstProposal.handshake.status).toBe("PROPOSAL");

    const counterpartyProposal = simulator.receive(proposal(second, first, simulator));
    expect(counterpartyProposal.accepted).toBe(true);
    if (!counterpartyProposal.accepted) {
      throw new Error("Counterparty proposal should be accepted.");
    }
    expect(counterpartyProposal.command).toEqual({
      type: "SUBMIT_PROPOSAL",
      participantId: second.endpointId,
    });
    expect(counterpartyProposal.handshake.status).toBe("WAITING_DUAL_CONSENT");

    const firstConsent = simulator.receive(consent(first, second, simulator));
    expect(firstConsent.accepted).toBe(true);
    expect(simulator.handshake.status).toBe("WAITING_DUAL_CONSENT");

    const secondConsent = simulator.receive(consent(second, first, simulator));
    expect(secondConsent.accepted).toBe(true);
    expect(simulator.handshake.status).toBe("REVEALED");
    expect(simulator.handshake.version).toBe(9);
    expect(simulator.handshake.dualConsent?.decisions).toEqual([
      { participantId: first.endpointId, decision: "CONTINUE" },
      { participantId: second.endpointId, decision: "CONTINUE" },
    ]);
    expect(simulator.statusHistory).toEqual([
      "DRAFT",
      "READY",
      "DISCOVERING",
      "CANDIDATE_FOUND",
      "OWNER_AUTHORIZED",
      "SCREENING",
      "PROPOSAL",
      "WAITING_DUAL_CONSENT",
      "REVEALED",
    ]);
  });

  it("rejects a valid HSP message from another community without changing state", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();
    const before = simulator.handshake;

    const result = simulator.receive(
      proposal(first, second, simulator, { communityId: "community_other" }),
    );

    expectRejected(result, "COMMUNITY_MISMATCH");
    expect(simulator.handshake).toBe(before);
  });

  it("rejects a stale state_version before command mapping mutates the aggregate", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();
    const staleVersion = simulator.handshake.version;
    expect(simulator.receive(proposal(first, second, simulator)).accepted).toBe(true);
    const before = simulator.handshake;

    const result = simulator.receive(
      proposal(second, first, simulator, { stateVersion: staleVersion }),
    );

    expectRejected(result, "STALE_STATE_VERSION");
    expect(simulator.handshake).toBe(before);
  });

  it("rejects a repeated message_id before stale-state handling and preserves state", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();
    const firstProposal = proposal(first, second, simulator);
    expect(simulator.receive(firstProposal).accepted).toBe(true);
    const beforeReplay = simulator.handshake;

    const replay = simulator.receive(firstProposal);

    expectRejected(replay, "REPLAY_DETECTED");
    expect(simulator.handshake).toBe(beforeReplay);
  });

  it("rejects a reused idempotency key even when the message id changes", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();
    const accepted = proposal(first, second, simulator);
    expect(simulator.receive(accepted).accepted).toBe(true);
    const beforeReplay = simulator.handshake;
    const replay = {
      ...proposal(first, second, simulator),
      idempotency_key: accepted.idempotency_key,
    };

    expectRejected(simulator.receive(replay), "REPLAY_DETECTED");
    expect(simulator.handshake).toBe(beforeReplay);
  });

  it("rejects a second proposal from the same Endpoint without changing state", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();
    expect(simulator.receive(proposal(first, second, simulator)).accepted).toBe(true);
    const beforeSecondProposal = simulator.handshake;

    const repeatedSender = simulator.receive(proposal(first, second, simulator));

    expectRejected(repeatedSender, "DOMAIN_COMMAND_REJECTED");
    expect(simulator.handshake).toBe(beforeSecondProposal);
  });

  it("rejects an exact HSP replay after the aggregate reaches a terminal state", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();
    const timeout = terminate(first, second, simulator);
    expect(simulator.receive(timeout).accepted).toBe(true);
    expect(simulator.handshake.status).toBe("EXPIRED");
    const terminal = simulator.handshake;

    expectRejected(simulator.receive(timeout), "REPLAY_DETECTED");
    expect(simulator.handshake).toBe(terminal);
  });

  it("rejects a mismatched handshake id and an Endpoint outside the participant pair", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();

    const wrongHandshake = {
      ...proposal(first, second, simulator),
      handshake_id: "hs_another",
    };
    expectRejected(simulator.receive(wrongHandshake), "HANDSHAKE_MISMATCH");

    const outsider = createSyntheticEndpoint({
      endpointId: "endpoint_outsider",
      communityId: COMMUNITY_ID,
      now: () => new Date(NOW),
    });
    expectRejected(
      simulator.receive(proposal(outsider, second, simulator)),
      "PARTICIPANT_MISMATCH",
    );
  });

  it("denies known but unimplemented message types by default", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();

    const validQuestion = first.createMessage({
      type: "QUESTION",
      handshakeId: HANDSHAKE_ID,
      recipientEndpointId: second.endpointId,
      stateVersion: simulator.handshake.version,
      expectedStatus: simulator.handshake.status,
      payload: {
        round: 1,
        questions: [
          {
            question_id: "q_skill",
            predicate: "skill.product_design",
            required: true,
          },
        ],
      },
    });
    expectRejected(simulator.receive(validQuestion), "UNSUPPORTED_MESSAGE_TYPE");
  });

  it("preserves INVALID_SCHEMA for an unknown message type and malformed signature", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();
    const validProposal = proposal(first, second, simulator);

    expectRejected(
      simulator.receive({ ...validProposal, type: "FUTURE_MESSAGE" }),
      "INVALID_SCHEMA",
    );

    expectRejected(
      simulator.receive({
        ...validProposal,
        signature: { ...validProposal.signature, value: "x" },
      }),
      "INVALID_SCHEMA",
    );
  });

  it("preserves UNSUPPORTED_PROTOCOL_VERSION at the receive boundary", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();
    const validProposal = proposal(first, second, simulator);

    expectRejected(
      simulator.receive({ ...validProposal, protocol_version: "0.3.0" }),
      "UNSUPPORTED_PROTOCOL_VERSION",
    );
  });

  it("preserves MESSAGE_EXPIRED at the receive boundary", () => {
    const { first, second, simulator } = createScenario();
    simulator.bootstrapToScreening();
    const validProposal = proposal(first, second, simulator);
    const expired = {
      ...validProposal,
      issued_at: "2026-09-14T09:58:00.000Z",
      expires_at: "2026-09-14T09:59:00.000Z",
    };

    expectRejected(simulator.receive(expired), "MESSAGE_EXPIRED");
  });
});
