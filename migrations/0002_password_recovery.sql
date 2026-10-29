ALTER TABLE users ADD COLUMN legacy_sessions_disabled INTEGER NOT NULL DEFAULT 0;
CREATE TABLE password_resets (
 token_hash TEXT PRIMARY KEY,
 uid TEXT NOT NULL REFERENCES users(uid),
 expires_at INTEGER NOT NULL,
 used_at INTEGER,
 claim_id TEXT
);
CREATE INDEX password_resets_uid ON password_resets(uid);
