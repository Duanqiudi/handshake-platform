# Protocol Simulator

This private package proves that the HSP wire contract and the framework-free domain state machine
compose into one deterministic flow. It uses synthetic endpoints, placeholder signature material,
and no network, database, model provider, or personal data.

The simulator validates each message at the boundary before mapping it to a domain command. It also
rejects handshake, community, participant, status, and optimistic-version mismatches. Cryptographic
signature verification belongs to the persistent Gateway slice in delivery phase 2. The in-memory
composition layer also rejects a repeated `message_id` before stale-state handling; durable replay
and nonce storage belongs to the Gateway.
