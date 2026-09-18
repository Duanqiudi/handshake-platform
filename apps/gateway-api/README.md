# Gateway API — Feasibility Slice

This app is a deliberately small HTTP composition root. It exposes a screening-ready Handshake,
tenant-scoped reads, and HSP message intake backed by the SQLite feasibility adapter.

```bash
pnpm --filter @handshake/gateway-api build
HANDSHAKE_DB_PATH=./var/handshake.sqlite pnpm --filter @handshake/gateway-api start
```

Routes:

- `GET /healthz`
- `POST /v1/communities/:communityId/handshakes`
- `GET /v1/communities/:communityId/handshakes/:handshakeId`
- `POST /v1/communities/:communityId/handshakes/:handshakeId/messages`

All `/v1/communities/*` requests require `x-handshake-dev-community-id` to match the route. This is
a test context boundary, not authentication: any local client can forge it. Production identity is
explicitly deferred.

The create route intentionally starts at `SCREENING`: discovery and real identity are assumed so
the Idea test can focus on persisted HSP negotiation and dual consent. This app has no production
authentication, real signature verification, model calls, UI, or deployment hardening.
