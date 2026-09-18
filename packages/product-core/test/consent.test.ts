import { describe, expect, it } from "vitest";
import { canRevealContacts, createConsentVersion, revealContacts } from "../src/index.js";
import { disclosureContent, handshake, NOW } from "./fixtures.js";

describe("dual-consent contact guard", () => {
  it("creates the same digest for the same disclosure content regardless of object key order", () => {
    const content = disclosureContent();
    const reordered = {
      recommendations: content.recommendations,
      claims: content.claims,
      capsules: content.capsules,
      participantOwnerIds: content.participantOwnerIds,
      handshakeId: content.handshakeId,
    };

    expect(createConsentVersion(content)).toBe(createConsentVersion(reordered));
    expect(createConsentVersion(content)).toMatch(/^consent_v1_[a-f0-9]{64}$/);
  });

  it("changes the consent version when disclosed content changes", () => {
    const content = disclosureContent();
    const changed = {
      ...content,
      claims: [
        {
          id: "claim_1",
          ownerId: "owner_alice",
          recipientOwnerId: "owner_bob",
          predicate: "availability",
          value: "周末四小时",
        },
      ],
    };

    expect(createConsentVersion(changed)).not.toBe(createConsentVersion(content));
  });

  it("does not change the consent version when set-like disclosure arrays are reordered", () => {
    const content = disclosureContent();
    const withClaims = {
      ...content,
      claims: [
        {
          id: "claim_2",
          ownerId: "owner_bob",
          recipientOwnerId: "owner_alice",
          predicate: "goal",
          value: "做出作品",
        },
        {
          id: "claim_1",
          ownerId: "owner_alice",
          recipientOwnerId: "owner_bob",
          predicate: "availability",
          value: "周末四小时",
        },
      ],
    } as const;
    const reordered = {
      ...withClaims,
      capsules: [...withClaims.capsules].reverse(),
      claims: [...withClaims.claims].reverse(),
    };

    expect(createConsentVersion(withClaims)).toBe(createConsentVersion(reordered));
  });

  it("allows reveal only after both owners continue on the current version", () => {
    const base = handshake();
    const consentVersion = createConsentVersion(base.disclosureContent);
    const agreed = {
      ...base,
      decisions: [
        { ownerId: "owner_alice", decision: "continue", consentVersion, decidedAt: NOW },
        { ownerId: "owner_bob", decision: "continue", consentVersion, decidedAt: NOW },
      ],
    } as const;

    expect(canRevealContacts(base)).toBe(false);
    expect(canRevealContacts({ ...agreed, decisions: agreed.decisions.slice(0, 1) })).toBe(false);
    expect(
      canRevealContacts({
        ...agreed,
        decisions: [
          agreed.decisions[0],
          { ...agreed.decisions[1], consentVersion: "consent_v1_stale" },
        ],
      }),
    ).toBe(false);
    expect(canRevealContacts(agreed)).toBe(true);
  });

  it("reveals exactly two participant contacts without mutating the handshake", () => {
    const base = handshake();
    const consentVersion = createConsentVersion(base.disclosureContent);
    const agreed = {
      ...base,
      decisions: [
        { ownerId: "owner_alice", decision: "continue", consentVersion, decidedAt: NOW },
        { ownerId: "owner_bob", decision: "continue", consentVersion, decidedAt: NOW },
      ],
    } as const;
    const contacts = [
      { ownerId: "owner_alice", kind: "email", value: "alice@example.test" },
      { ownerId: "owner_bob", kind: "wechat", value: "bob-demo" },
    ] as const;

    const revealed = revealContacts(agreed, contacts, NOW);

    expect(revealed.status).toBe("REVEALED");
    expect(revealed.contactReveal).toEqual({ revealedAt: NOW, contacts });
    expect(base.contactReveal).toBeNull();
  });

  it("keeps valid reveal proof usable after the owners enter their project", () => {
    const base = handshake();
    const consentVersion = createConsentVersion(base.disclosureContent);
    const agreed = {
      ...base,
      decisions: [
        { ownerId: "owner_alice", decision: "continue", consentVersion, decidedAt: NOW },
        { ownerId: "owner_bob", decision: "continue", consentVersion, decidedAt: NOW },
      ],
    } as const;
    const revealed = revealContacts(
      agreed,
      [
        { ownerId: "owner_alice", kind: "email", value: "alice@example.test" },
        { ownerId: "owner_bob", kind: "email", value: "bob@example.test" },
      ],
      NOW,
    );

    expect(canRevealContacts({ ...revealed, status: "INTRODUCED" })).toBe(true);
    expect(canRevealContacts({ ...revealed, status: "FEEDBACK_COMPLETE" })).toBe(true);
  });

  it("throws if callers try to bypass the guard", () => {
    expect(() =>
      revealContacts(
        handshake(),
        [
          { ownerId: "owner_alice", kind: "email", value: "alice@example.test" },
          { ownerId: "owner_bob", kind: "email", value: "bob@example.test" },
        ],
        NOW,
      ),
    ).toThrowError(/dual consent/i);
  });
});
