# Gateway application layer

This package is the framework-neutral application boundary for the feasibility Gateway. It
coordinates HSP validation, tenant and participant isolation, explicit wire-to-domain mapping,
the pure handshake aggregate, and an atomic persistence port.

`createScreeningHandshake` is deliberately a feasibility shortcut: it walks every legal domain
transition from `DRAFT` through `READY`, `DISCOVERING`, `CANDIDATE_FOUND`, and
`OWNER_AUTHORIZED` to `SCREENING`, but does not run real candidate discovery or owner
authorization. Production entry points must replace this bootstrap with their actual use cases.

Only `PROPOSAL`, `OWNER_DECISION`, and domain-expressible `TERMINATE` messages mutate the
aggregate. Every other valid HSP message is rejected by default. Signatures are structurally
validated by the HSP contract package; cryptographic signature verification belongs at the
transport/security boundary and is not claimed by this feasibility package.

## Persistence contract

Adapters must make `commitMessage` atomic: reserve the message id, sender-scoped nonce, and
monotonically increasing sequence within each `(community, handshake, sender)`, check the expected
aggregate version, persist `nextHandshake`, and record the transition metadata in one transaction.
These replay checks must be durable, not process-local.

Run `pnpm --filter @handshake/application test` for the in-memory port contract examples.
