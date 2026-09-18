import { describe, expect, it } from "vitest";
import {
  ABNORMAL_TERMINATION_STATUSES,
  allowedTransitionsFrom,
  canTransition,
  HANDSHAKE_STATUSES,
  isActiveStatus,
  isHandshakeStatus,
  isTerminalStatus,
  TERMINAL_HANDSHAKE_STATUSES,
} from "../src/index.js";

describe("handshake transition graph", () => {
  it("contains every HSP 0.2 state exactly once", () => {
    expect(new Set(HANDSHAKE_STATUSES).size).toBe(HANDSHAKE_STATUSES.length);
    expect(HANDSHAKE_STATUSES).toHaveLength(20);
    expect(HANDSHAKE_STATUSES).toContain("WAITING_OWNER");
    expect(HANDSHAKE_STATUSES).toContain("WAITING_DUAL_CONSENT");
    expect(HANDSHAKE_STATUSES).toContain("DISPUTED");
  });

  it("allows the normal PRD progression and rejects skipped phases", () => {
    expect(canTransition("DRAFT", "READY")).toBe(true);
    expect(canTransition("READY", "DISCOVERING")).toBe(true);
    expect(canTransition("DISCOVERING", "CANDIDATE_FOUND")).toBe(true);
    expect(canTransition("CANDIDATE_FOUND", "OWNER_AUTHORIZED")).toBe(true);
    expect(canTransition("OWNER_AUTHORIZED", "SCREENING")).toBe(true);
    expect(canTransition("SCREENING", "PROPOSAL")).toBe(true);
    expect(canTransition("PROPOSAL", "WAITING_DUAL_CONSENT")).toBe(true);
    expect(canTransition("WAITING_DUAL_CONSENT", "REVEALED")).toBe(true);
    expect(canTransition("REVEALED", "INTRODUCED")).toBe(true);
    expect(canTransition("INTRODUCED", "FEEDBACK_COMPLETE")).toBe(true);

    expect(canTransition("DRAFT", "SCREENING")).toBe(false);
    expect(canTransition("SCREENING", "REVEALED")).toBe(false);
    expect(canTransition("PROPOSAL", "INTRODUCED")).toBe(false);
  });

  it("allows abnormal termination from every active state", () => {
    for (const status of HANDSHAKE_STATUSES) {
      if (!isActiveStatus(status)) {
        continue;
      }
      for (const terminal of ABNORMAL_TERMINATION_STATUSES) {
        expect(canTransition(status, terminal), `${status} -> ${terminal}`).toBe(true);
      }
    }
  });

  it("gives terminal states no outgoing transitions", () => {
    for (const status of TERMINAL_HANDSHAKE_STATUSES) {
      expect(isTerminalStatus(status)).toBe(true);
      expect(isActiveStatus(status)).toBe(false);
      expect(allowedTransitionsFrom(status)).toEqual([]);
    }
  });

  it("recognizes only declared statuses", () => {
    expect(isHandshakeStatus("SCREENING")).toBe(true);
    expect(isHandshakeStatus("screening")).toBe(false);
    expect(isHandshakeStatus("UNKNOWN_STATUS")).toBe(false);
    expect(isHandshakeStatus(null)).toBe(false);
  });
});
