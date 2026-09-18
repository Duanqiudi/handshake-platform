# `@handshake/platform-api`

The member-facing V1 HTTP API. It exposes the product application service, persists state in
SQLite, and can serve the built member web application in production.

## Run

```bash
pnpm --filter @handshake/platform-api build
$env:HANDSHAKE_DEMO_MODE="true"
pnpm --filter @handshake/platform-api start
```

The default address is `http://127.0.0.1:3220`. In production, build `@handshake/member-web` and
set `NODE_ENV=production`; the API then serves `apps/member-web/dist` with SPA fallback.

Configuration:

- `PORT` and `HOST`
- `HANDSHAKE_PRODUCT_DB_PATH`
- `HANDSHAKE_DEMO_MODE=true` to enable `POST /v1/demo/reset`
- `HANDSHAKE_INVITE_CODE` to require an invite code during onboarding
- `HANDSHAKE_CORS_ORIGINS` as a comma-separated allowlist

Every successful API response uses `{ "data": ... }`. Errors use
`{ "error": { "code", "message", "retryable", "details"? } }`.
