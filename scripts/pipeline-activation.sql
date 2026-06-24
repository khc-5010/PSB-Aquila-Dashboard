-- Pipeline Activation migration (run once in the Neon SQL Editor)
--
-- Adds the two opportunity columns and teaches the `stage` ENUM the two new
-- front stages ('on_deck', 'outreach'). api/opportunities.js also self-heals
-- both at runtime (ensureOpportunitySchema), so this script is mainly for
-- reproducibility / immediate application without waiting for a redeploy.

-- 1. New columns (idempotent)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_type TEXT;   -- 'client' | 'partner'
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS waiting_on TEXT;  -- 'us' | 'them'

-- 2. Add the new stages to whatever ENUM type backs the stage columns.
--    `stage` is a Postgres enum (not a CHECK), so new values must be added to
--    the type or INSERT/UPDATE with the new stages raises
--    "invalid input value for enum stage". ADD VALUE IF NOT EXISTS is idempotent.
--    On PG 12+ this is allowed inside a DO block as long as the value isn't used
--    in the same transaction (it isn't here). No-op if stage is a text column.
DO $$
DECLARE
  tn text;
BEGIN
  FOR tn IN
    SELECT DISTINCT t.typname
    FROM pg_type t
    JOIN pg_attribute a ON a.atttypid = t.oid
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE t.typtype = 'e'
      AND (
        (c.relname = 'opportunities' AND a.attname = 'stage')
        OR (c.relname = 'stage_transitions' AND a.attname IN ('from_stage', 'to_stage'))
      )
  LOOP
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', tn, 'on_deck');
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', tn, 'outreach');
    RAISE NOTICE 'Added on_deck/outreach to enum type %', tn;
  END LOOP;
END $$;
