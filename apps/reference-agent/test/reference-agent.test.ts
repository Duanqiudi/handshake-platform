import { validateHspMessage } from "@handshake/hsp-contracts";
import { describe, expect, it } from "vitest";
import {
  discloseAllowedCapsule,
  type LocalProfile,
  ReferenceAgent,
  RuleBasedCompatibilityEvaluator,
} from "../src/index.js";

const profile: LocalProfile = {
  schemaVersion: "reference-profile-0.1",
  endpointId: "agent_product_alpha",
  publicCapsule: {
    collaborationGoal: "find a technical cofounder for an AI productivity product",
    offers: ["product design", "user research"],
    seeks: ["backend engineering", "machine learning"],
    availability: "8 hours per week",
  },
  privateMemory: {
    rawNotes: "I previously left a difficult company and do not want this shared.",
    contactDetails: "private@example.test",
  },
  disclosurePolicy: {
    allowedFields: ["collaborationGoal", "offers", "seeks", "availability"],
  },
};

describe("ReferenceAgent", () => {
  it("uses only policy-approved public data and never returns private memory", () => {
    const disclosed = discloseAllowedCapsule(profile);
    const serialized = JSON.stringify(disclosed);

    expect(disclosed).toEqual(profile.publicCapsule);
    expect(serialized).not.toContain(profile.privateMemory.rawNotes);
    expect(serialized).not.toContain(profile.privateMemory.contactDetails);
  });

  it("creates a schema-valid continue proposal from reciprocal capabilities", () => {
    const agent = new ReferenceAgent(new RuleBasedCompatibilityEvaluator());
    const proposal = agent.createProposal({
      profile,
      candidate: {
        collaborationGoal: "find a product partner for an AI developer tool",
        offers: ["backend engineering", "machine learning"],
        seeks: ["product design"],
        availability: "10 hours per week",
      },
      communityId: "community_alpha",
      handshakeId: "hs_reference_agent",
      recipientEndpointId: "agent_engineering_beta",
      sequence: 1,
      stateVersion: 5,
      now: new Date("2026-09-15T12:00:00.000Z"),
    });

    expect(proposal.payload).toMatchObject({
      recommendation: "continue",
      stop_code: "SUCCESS_PROPOSAL",
    });
    expect(validateHspMessage(proposal)).toEqual({ ok: true, value: proposal });
    const serialized = JSON.stringify(proposal);
    expect(serialized).not.toContain(profile.privateMemory.rawNotes);
    expect(serialized).not.toContain(profile.privateMemory.contactDetails);
  });

  it("requires owner review when the policy withholds capability information", () => {
    const agent = new ReferenceAgent(new RuleBasedCompatibilityEvaluator());
    const proposal = agent.createProposal({
      profile: {
        ...profile,
        disclosurePolicy: { allowedFields: ["collaborationGoal", "availability"] },
      },
      candidate: {
        offers: ["backend engineering"],
        seeks: ["product design"],
      },
      communityId: "community_alpha",
      handshakeId: "hs_reference_review",
      recipientEndpointId: "agent_engineering_beta",
      sequence: 1,
      stateVersion: 5,
      now: new Date("2026-09-15T12:00:00.000Z"),
    });

    expect(proposal.payload).toMatchObject({
      recommendation: "owner_review",
      stop_code: "HUMAN_REQUIRED",
    });
  });
});
