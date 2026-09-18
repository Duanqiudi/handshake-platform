# SQLite Handshake Store

This is the phase-two feasibility adapter for `@handshake/application`. It persists the current
Handshake aggregate, received-message replay keys, and transition metadata in one SQLite
transaction. Every lookup includes `community_id`; replay protection persists message ids,
sender-scoped nonces, and per-handshake sender sequences.

SQLite is a validation shortcut, not the production database decision. The application depends on
the `HandshakeStore` port, so a PostgreSQL adapter can replace this package without changing domain
rules or HTTP handlers.
