# HSP Contracts

`@handshake/hsp-contracts` is the single wire-contract source for Handshake Protocol 0.2.
It contains TypeScript types, distributable draft-07 JSON Schemas, AJV runtime validators,
protocol-version negotiation, and structured protocol errors.

## Contract surface

- Published objects: `AgentCard`, `IntentCapsule`, `ClaimEnvelope`, and
  `AuthorizationReceipt`.
- Signed envelope metadata: message ID, Handshake ID, community ID, endpoint IDs, sequence,
  optimistic state version, idempotency key, nonce, TTL, and detached Ed25519 signature.
- Message payloads: `CAPABILITY_OFFER`, `QUESTION`, `CLAIM_RESPONSE`, `EVIDENCE_REQUEST`,
  `OWNER_REQUIRED`, `CONFLICT_FOUND`, `PROPOSAL`, `OWNER_DECISION`, `REVEAL_RECEIPT`, and
  `TERMINATE`.
- The complete HSP 0.2 status and stop-code vocabularies.

## Runtime validation

```ts
import { assertHspMessage, validateHspMessage } from "@handshake/hsp-contracts";

const result = validateHspMessage(input, { now: new Date() });
if (!result.ok) {
  console.error(result.error.code, result.error.details);
}

const message = assertHspMessage(input);
```

The validators reject additional fields, payload/type mismatches, incompatible protocol
versions, invalid temporal windows, expired messages when a clock is supplied, revoked or
scope-mismatched claim authorization, and prohibited claims on the wire. Cryptographic signature,
nonce replay, and idempotency-store checks remain Gateway or Endpoint responsibilities because
they require keys or persistent state.

HSP is pre-1.0: minor versions are compatibility boundaries, while patches within the `0.2.x`
line are wire-compatible. JSON Schemas are exported under `@handshake/hsp-contracts/schemas/*`.
