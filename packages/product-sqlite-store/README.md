# Product SQLite Store

Small-pilot persistence adapter for the product application. It stores one versioned community
snapshot and applies optimistic compare-and-swap updates. This keeps the invite-only 10–20 person
validation simple while preserving an explicit port that can later be replaced by normalized
PostgreSQL repositories.

The snapshot schema has no raw-memory or provider-credential field.
