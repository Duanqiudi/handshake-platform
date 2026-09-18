export const SQLITE_MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS handshake_aggregates (
        community_id TEXT NOT NULL,
        handshake_id TEXT NOT NULL,
        status TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        aggregate_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (community_id, handshake_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS received_messages (
        community_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        handshake_id TEXT NOT NULL,
        sender_endpoint_id TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        nonce TEXT NOT NULL,
        envelope_digest TEXT NOT NULL,
        received_at TEXT NOT NULL,
        PRIMARY KEY (community_id, message_id),
        UNIQUE (community_id, sender_endpoint_id, nonce),
        UNIQUE (community_id, handshake_id, sender_endpoint_id, sequence),
        FOREIGN KEY (community_id, handshake_id)
          REFERENCES handshake_aggregates (community_id, handshake_id)
          ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS handshake_transitions (
        transition_id INTEGER PRIMARY KEY AUTOINCREMENT,
        community_id TEXT NOT NULL,
        handshake_id TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        aggregate_version INTEGER NOT NULL CHECK (aggregate_version >= 0),
        message_id TEXT,
        occurred_at TEXT NOT NULL,
        FOREIGN KEY (community_id, handshake_id)
          REFERENCES handshake_aggregates (community_id, handshake_id)
          ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_handshake_transitions_lookup
        ON handshake_transitions (community_id, handshake_id, transition_id);
    `,
  },
] as const;
