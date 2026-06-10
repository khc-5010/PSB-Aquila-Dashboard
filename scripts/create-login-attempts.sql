-- Login brute-force protection (see api/auth.js).
-- The auth function also creates this table lazily with CREATE TABLE IF NOT
-- EXISTS, so running this in the Neon SQL editor is optional but recommended
-- for fresh environments.

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_failed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ
);
